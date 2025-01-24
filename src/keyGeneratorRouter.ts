import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';

const router = Router();

// Validation schema for key generation request
const KeyGenRequestSchema = z.object({
    passphrase: z.string().min(1, "Passphrase is required")
});

interface KeyPairResponse {
    success: boolean;
    data?: {
        publicKey: string;
        privateKey: string;
        passphrase: string;
    };
    error?: string;
}

/**
 * Generates RSA key pair with the given passphrase
 */
const generateKeyPair = (passphrase: string) => {
    return crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: "spki",
            format: "pem",
        },
        privateKeyEncoding: {
            type: "pkcs1",
            format: "pem",
            cipher: "des-ede3-cbc",
            passphrase,
        },
    });
};

/**
 * Route to generate new key pair
 * POST /api/keys/generate
 * Body: { passphrase: string }
 */
// @ts-ignore
router.post('/generate', async (req: Request, res: Response<KeyPairResponse>) => {
    try {
        // Validate request body
        const { passphrase } = KeyGenRequestSchema.parse(req.body);

        // Generate key pair
        const keyPair = generateKeyPair(passphrase);

        // Format successful response
        const response: KeyPairResponse = {
            success: true,
            data: {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                passphrase: passphrase
            }
        };

        // Return the generated keys
        return res.status(200).json(response);

    } catch (error) {
        // Handle validation errors
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: error.errors[0].message
            });
        }

        // Handle other errors
        console.error('Error generating key pair:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate key pair'
        });
    }
});

/**

 * Route to verify a key pair
 * POST /api/keys/verify
 * Body: { publicKey: string, privateKey: string, passphrase: string }
 */
// @ts-ignore
router.post('/verify', async (req: Request, res: Response) => {
    const VerifyKeyPairSchema = z.object({
        publicKey: z.string(),
        privateKey: z.string(),
        passphrase: z.string()
    });

    try {
        // Validate request body
        const { publicKey, privateKey, passphrase } = VerifyKeyPairSchema.parse(req.body);

        // Test message to verify the key pair
        const testMessage = 'Test message for key verification';

        // Create private key object
        const privateKeyObject = crypto.createPrivateKey({
            key: privateKey,
            passphrase: passphrase,
        });

        // Create public key object
        const publicKeyObject = crypto.createPublicKey(publicKey);

        // Sign and verify test message
        const signature = crypto.sign('sha256', Buffer.from(testMessage), privateKeyObject);
        const isValid = crypto.verify('sha256', Buffer.from(testMessage), publicKeyObject, signature);

        return res.status(200).json({
            success: true,
            data: {
                isValid,
                message: isValid ? 'Key pair is valid' : 'Key pair verification failed'
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: error.errors[0].message
            });
        }

        console.error('Error verifying key pair:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify key pair'
        });
    }
});

/**
 * Route to get key pair formatting instructions
 * GET /api/keys/instructions
 */
router.get('/instructions', (req: Request, res: Response) => {
    const instructions = `
  Instructions for using the generated keys:

  1. Add to .env file:
     PASSPHRASE="your_generated_passphrase"
     PRIVATE_KEY="your_generated_private_key"

  2. Upload public key to WhatsApp Business Platform:
     - Go to your WhatsApp Business account settings
     - Find the Flow endpoint configuration section
     - Copy and paste the generated public key

  3. Verify your setup:
     - Use the /api/keys/verify endpoint to test your key pair
     - Make sure to keep your private key and passphrase secure
  `;

    res.status(200).json({
        success: true,
        data: {
            instructions
        }
    });
});

export default router;