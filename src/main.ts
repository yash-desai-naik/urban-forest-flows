import express, { Request, Response } from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import keyGeneratorRouter from "./keyGeneratorRouter";
import webhook from "./webhook";
import razorpay_webhook_handler_router from "./razorpay_webhook_handler_router";
import path from "node:path";

// Load environment variables
dotenv.config();

// make sure env loaded
if (!process.env.PRIVATE_KEY) {
    throw new Error('Private key is empty. Please check your env variable "PRIVATE_KEY".');
}

// say okay if .env loaded
if (process.env.PRIVATE_KEY) {
    console.log('env loaded');
}

// Types for WhatsApp Flow requests and responses
interface FlowRequest {
    encrypted_aes_key: string;
    encrypted_flow_data: string;
    initial_vector: string;
}

interface DecryptedFlowData {
    screen: string;
    data: any;
    version: string;
    action: string;
    flow_token: string;
}

interface RegistrationData {
    screen_0_Full_name_0: string;
    screen_0_Email_address_1: string;
}

interface PassSelectionData {
    Please_select_your_pass_type_4ea1a2: string;
}

// Screen response templates
const SCREEN_RESPONSES = {
    screen_lmaspf: {
        screen: "screen_lmaspf",
        data: {}
    },
    screen_cnktoz: {
        screen: "screen_cnktoz",
        data: {
            screen_0_Full_name_0: "Example",
            screen_0_Email_address_1: "Example"
        }
    },
    SUCCESS: {
        screen: "SUCCESS",
        data: {
            extension_message_response: {
                params: {
                    flow_token: "flows-builder-6647c3f4",
                    some_param_name: "PASS_CUSTOM_VALUE"
                }
            }
        }
    }
};

// Custom error class for flow endpoint exceptions
class FlowEndpointException extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}

// Encryption utility functions
const decryptRequest = (
    body: FlowRequest,
    privatePem: string,
    passphrase: string
): { decryptedBody: DecryptedFlowData; aesKeyBuffer: Buffer; initialVectorBuffer: Buffer } => {
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

    const privateKey = crypto.createPrivateKey({ key: privatePem, passphrase });
    let decryptedAesKey: Buffer;

    try {
        decryptedAesKey = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            Buffer.from(encrypted_aes_key, "base64")
        );
    } catch (error) {
        console.error(error);
        throw new FlowEndpointException(
            421,
            "Failed to decrypt the request. Please verify your private key."
        );
    }

    const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
    const initialVectorBuffer = Buffer.from(initial_vector, "base64");

    const TAG_LENGTH = 16;
    const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
    const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);

    const decipher = crypto.createDecipheriv(
        "aes-128-gcm",
        decryptedAesKey,
        initialVectorBuffer
    );
    decipher.setAuthTag(encrypted_flow_data_tag);

    const decryptedJSONString = Buffer.concat([
        decipher.update(encrypted_flow_data_body),
        decipher.final(),
    ]).toString("utf-8");

    return {
        decryptedBody: JSON.parse(decryptedJSONString),
        aesKeyBuffer: decryptedAesKey,
        initialVectorBuffer,
    };
};

const encryptResponse = (
    response: any,
    aesKeyBuffer: Buffer,
    initialVectorBuffer: Buffer
): string => {
    const flipped_iv = Array.from(initialVectorBuffer).map(byte => ~byte);

    const cipher = crypto.createCipheriv(
        "aes-128-gcm",
        aesKeyBuffer,
        Buffer.from(flipped_iv)
    );

    return Buffer.concat([
        cipher.update(JSON.stringify(response), "utf-8"),
        cipher.final(),
        cipher.getAuthTag(),
    ]).toString("base64");
};

// Request signature validation
const isRequestSignatureValid = (req: Request): boolean => {
    const appSecret = process.env.APP_SECRET;

    if (!appSecret) {
        console.warn("App Secret is not set up. Please add your app secret in /.env file to check for request validation");
        return true;
    }

    const signatureHeader = req.get("x-hub-signature-256");
    if (!signatureHeader) {
        return false;
    }

    const signatureBuffer = Buffer.from(signatureHeader.replace("sha256=", ""), "utf-8");
    const hmac = crypto.createHmac("sha256", appSecret);
    // @ts-ignore
    const digestString = hmac.update(req.rawBody).digest('hex');
    const digestBuffer = Buffer.from(digestString, "utf-8");

    return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
};

// Express app setup
const app = express();

// Parse JSON with raw body access for signature verification
app.use(express.json({
    verify: (req: Request & { rawBody?: string }, res: Response, buf: Buffer, encoding: string) => {
        // @ts-ignore
        req.rawBody = buf?.toString(encoding || "utf8");
    },
}));

app.use("/tickets", express.static(path.join(__dirname, "../tickets")));

// Main endpoint handler
// @ts-ignore
app.post("/", async (req: Request, res: Response) => {
    const { PRIVATE_KEY, PASSPHRASE = "", PORT = "3000" } = process.env;

    if (!PRIVATE_KEY) {
        throw new Error('Private key is empty. Please check your env variable "PRIVATE_KEY".');
    }

    if (!isRequestSignatureValid(req)) {
        return res.status(432).send();
    }

    try {
        const decryptedRequest = decryptRequest(req.body, PRIVATE_KEY, PASSPHRASE);
        const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;

        console.log("💬 Decrypted Request:", decryptedBody);

        // Handle different flow actions
        let response;

        if (decryptedBody.action === "ping") {
            response = { data: { status: "active" } };
        } else if (decryptedBody.action === "INIT") {
            response = SCREEN_RESPONSES.screen_lmaspf;
        } else if (decryptedBody.action === "data_exchange") {
            switch (decryptedBody.screen) {
                case "screen_lmaspf":
                    // Handle registration form submission
                    const registrationData: RegistrationData = {
                        screen_0_Full_name_0: decryptedBody.data.screen_0_Full_name_0,
                        screen_0_Email_address_1: decryptedBody.data.screen_0_Email_address_1
                    };
                    response = SCREEN_RESPONSES.screen_cnktoz;
                    break;

                case "screen_cnktoz":
                    // Handle pass selection and complete the flow
                    response = {
                        ...SCREEN_RESPONSES.SUCCESS,
                        data: {
                            extension_message_response: {
                                params: {
                                    flow_token: decryptedBody.flow_token
                                }
                            }
                        }
                    };
                    break;

                default:
                    throw new Error(`Unhandled screen: ${decryptedBody.screen}`);
            }
        }

        if (!response) {
            throw new Error("No response generated");
        }

        console.log("👉 Response to Encrypt:", response);
        const encryptedResponse = encryptResponse(response, aesKeyBuffer, initialVectorBuffer);
        res.send(encryptedResponse);

    } catch (err) {
        console.error(err);
        if (err instanceof FlowEndpointException) {
            return res.status(err.statusCode).send();
        }
        return res.status(500).send();
    }
});
app.use('/api/keys', keyGeneratorRouter);

app.use('/wa', webhook)

app.use("/api/webhooks", razorpay_webhook_handler_router);
// Health check endpoint
app.get("/", (req: Request, res: Response) => {
    res.send(`<pre>WhatsApp Flow Endpoint
Refer to documentation for usage.</pre>`);
});





// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is listening on port: ${port}`);
});