import express, { Request, Response } from 'express';
import { z } from 'zod';

// Types for the registration form data
interface RegistrationFormData {
    screen_0_Full_name_0: string;
    screen_0_Email_address_1: string;
}

// Types for the pass selection data
interface PassSelectionData {
    Please_select_your_pass_type_4ea1a2: string;
}

// Enum for pass types
enum PassType {
    ONE_DAY = "0_One_day",
    TWO_DAY = "1_Two__day",
    ALL_DAY_COMBO = "2_All_day_combo_pass",
    ONE_DAY_COMBO = "3_One_day_combo_pass",
}

// Schema for validating the incoming data
const dataExchangeSchema = z.object({
    status: z.literal('completed').optional(),
    screen_0_Full_name_0: z.string().optional(),
    screen_0_Email_address_1: z.string().email().optional(),
    Please_select_your_pass_type_4ea1a2: z.nativeEnum(PassType).optional(),
});

type DataExchangePayload = z.infer<typeof dataExchangeSchema>;

// Express router
const router = express.Router();

// Endpoint handler
// @ts-ignore
router.post('/whatsapp-flow', async (req: Request, res: Response) => {
    try {
        // Validate incoming data
        const payload = dataExchangeSchema.parse(req.body);

        // Check if this is the final submission
        if (payload.status === 'completed') {
            // Retrieve stored registration data from session/database
            const registrationData: RegistrationFormData = {
                screen_0_Full_name_0: req.body.screen_0_Full_name_0,
                screen_0_Email_address_1: req.body.screen_0_Email_address_1,
            };

            // Get pass selection
            const passData: PassSelectionData = {
                Please_select_your_pass_type_4ea1a2: req.body.Please_select_your_pass_type_4ea1a2,
            };

            // Process the complete submission
            await processCompletedSubmission(registrationData, passData);

            return res.status(200).json({
                success: true,
                message: 'Flow completed successfully',
            });
        }

        // Store intermediate data (registration form)
        if (payload.screen_0_Full_name_0 && payload.screen_0_Email_address_1) {
            // Store registration data in session/database
            await storeIntermediateData(payload);
        }

        return res.status(200).json({
            success: true,
            message: 'Data received successfully',
        });

    } catch (error) {
        console.error('Error processing WhatsApp flow data:', error);
        return res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Invalid data received',
        });
    }
});

// Helper function to process completed submissions
async function processCompletedSubmission(
    registrationData: RegistrationFormData,
    passData: PassSelectionData
): Promise<void> {
    // Here you would typically:
    // 1. Save to database
    // 2. Send confirmation emails
    // 3. Create user account
    // 4. Generate pass/ticket
    // 5. Send notifications

    console.log('Processing submission:', {
        registration: registrationData,
        passSelection: passData,
    });

    // Add your business logic here
}

// Helper function to store intermediate data
async function storeIntermediateData(
    data: DataExchangePayload
): Promise<void> {
    // Here you would typically:
    // 1. Store in session
    // 2. Save to temporary database record
    // 3. Update existing record

    console.log('Storing intermediate data:', data);

    // Add your storage logic here
}

export default router;