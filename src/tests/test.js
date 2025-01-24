import crypto from 'crypto';
import dotenv from 'dotenv';
import https from 'https';

dotenv.config();

const { APP_SECRET, PRIVATE_KEY, PASSPHRASE } = process.env;

/**
 * Generates encrypted payload for testing
 * @param {Object} data - The data to encrypt
 * @returns {Object} The encrypted payload and headers
 */
function generateTestPayload(data) {
    // Generate AES key
    const aesKey = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);

    // Get public key from private key
    const privateKey = crypto.createPrivateKey({
        key: PRIVATE_KEY,
        passphrase: PASSPHRASE,
    });
    const publicKey = crypto.createPublicKey(privateKey);

    // Encrypt AES key with RSA public key
    const encryptedAesKey = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        aesKey
    );

    // Encrypt data with AES key
    const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, iv);
    const encryptedData = Buffer.concat([
        cipher.update(JSON.stringify(data), "utf8"),
        cipher.final(),
        cipher.getAuthTag()
    ]);

    // Generate signature
    const bodyStr = JSON.stringify(data);
    const hmac = crypto.createHmac("sha256", APP_SECRET);
    const signature = hmac.update(bodyStr).digest('hex');

    return {
        payload: {
            encrypted_aes_key: encryptedAesKey.toString('base64'),
            encrypted_flow_data: encryptedData.toString('base64'),
            initial_vector: iv.toString('base64')
        },
        headers: {
            'x-hub-signature-256': `sha256=${signature}`
        },
        rawBody: bodyStr
    };
}

// Example usage
const testCases = [
    // Init request
    {
        action: "INIT",
        flow_token: "flows-builder-6647c3f4"
    },

    // Registration form submission
    {
        screen: "screen_lmaspf",
        action: "data_exchange",
        flow_token: "flows-builder-6647c3f4",
        data: {
            screen_0_Full_name_0: "John Doe",
            screen_0_Email_address_1: "john@example.com"
        }
    },

    // Pass selection submission
    {
        screen: "screen_cnktoz",
        action: "data_exchange",
        flow_token: "flows-builder-6647c3f4",
        data: {
            Please_select_your_pass_type_4ea1a2: "0_One_day"
        }
    }
];

function callCurl(baseURL, headers, rawBody) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };

    const req = https.request(baseURL, options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        res.on('data', (chunk) => {
            console.log(`Body: ${chunk.toString()}`);
        });
    });

    req.on('error', (error) => {
        console.error(`Error: ${error.message}`);
    });

    req.write(rawBody);
    req.end();
}

// Generate and print curl commands for each test case
testCases.forEach((testCase, index) => {
    const { payload, headers, rawBody } = generateTestPayload(testCase);

    // const baseURL = 'http://localhost:3001';
    const baseURL = 'https://f91e-2401-4900-7c24-b73c-ddb1-9c06-8175-f52d.ngrok-free.app';
    console.log(`\n# Test Case ${index + 1}: ${testCase.action}`);
    console.log(`curl -X POST ${baseURL} \\
  -H "Content-Type: application/json" \\
  -H "x-hub-signature-256: ${headers['x-hub-signature-256']}" \\
  -d '${JSON.stringify(payload)}'`);

    console.log('\nRaw Body:', rawBody);
    console.log('Encrypted Payload:', JSON.stringify(payload, null, 2));
    
    callCurl(baseURL, headers, rawBody);
});