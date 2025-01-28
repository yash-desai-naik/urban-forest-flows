import express, {Request, Response} from 'express';
import Razorpay from 'razorpay';
import axios from "axios";

// Types for WhatsApp message payload
interface WhatsAppMessageContext {
    from: string;
    id: string;
}

interface NFMReply {
    name: string;
    body: string;
    response_json: string;
}

interface WhatsAppMessage {
    context?: WhatsAppMessageContext;
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'interactive';
    text?: {
        body: string;
    };
    image?: {
        id: string;
        mime_type: string;
        sha256: string;
        caption?: string;
    };
    interactive?: {
        type: 'button' | 'list' | 'nfm_reply';
        button_reply?: {
            id: string;
            title: string;
        };
        list_reply?: {
            id: string;
            title: string;
            description?: string;
        };
        nfm_reply?: NFMReply;
    };
}

interface WhatsAppWebhookPayload {
    object: 'whatsapp_business_account';
    entry: Array<{
        id: string;
        changes: Array<{
            value: {
                messaging_product: 'whatsapp';
                metadata: {
                    display_phone_number: string;
                    phone_number_id: string;
                };
                contacts?: Array<{
                    profile: {
                        name: string;
                    };
                    wa_id: string;
                }>;
                messages?: WhatsAppMessage[];
            };
            field: string;
        }>;
    }>;
}

const router = express.Router();

// Webhook verification endpoint
router.get('/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Webhook message handling endpoint
// @ts-ignore
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const body: WhatsAppWebhookPayload = req.body;

        if (body.object !== 'whatsapp_business_account') {
            return res.sendStatus(404);
        }

        // Process each entry
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                const value = change.value;

                if (value.messages && value.messages.length > 0) {
                    for (const message of value.messages) {
                        await handleMessage(message);
                    }
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Message handling function
async function handleMessage(message: WhatsAppMessage): Promise<void> {
    try {
        switch (message.type) {
            case 'text':
                if (message.text) {
                    await processTextMessage(message.from, message.text.body);
                }
                break;
            case 'interactive':
                if (message.interactive) {
                    await processInteractiveMessage(message);
                }
                break;
            default:
                console.log(`Unhandled message type: ${message.type}`);
        }
    } catch (error) {
        console.error(`Error handling message: ${error}`);
    }
}

async function processTextMessage(from: string, text: string): Promise<void> {
    console.log(`Received text message from ${from}: ${text}`);
    // Add your text message handling logic here

    if (text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi')) {
        const url = 'https://graph.facebook.com/v16.0/514294548440290/messages';
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: from,
            type: 'template',
            template: {
                name: 'urban_forest_registration_final',
                language: {
                    code: 'en_US'
                },
                components: [
                    {
                        type: 'button',
                        sub_type: 'flow',
                        index: '0',
                        parameters: [
                            {
                                type: 'action',
                                action: {
                                    flow_token: 'flows-builder-41b29403'
                                }
                            }
                        ]
                    }
                ]
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('Failed to send message:', await response.text());
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }
}

async function processInteractiveMessage(message: WhatsAppMessage): Promise<void> {
    if (!message.interactive) return;

    const { from, context, interactive } = message;

    switch (interactive.type) {
        case 'nfm_reply':
            if (interactive.nfm_reply) {
                console.log(`Received NFM reply from ${from}:`, {
                    context: context,
                    name: interactive.nfm_reply.name,
                    body: interactive.nfm_reply.body,
                    response_json: interactive.nfm_reply.response_json
                });

                try {
                    // Parse the response_json string to get flow token and params
                    const responseData = JSON.parse(interactive.nfm_reply.response_json);
                    await handleNFMResponse(from, responseData, context);
                } catch (error) {
                    console.error('Error parsing NFM response_json:', error);
                }
            }
            break;
        case 'button':
            if (interactive.button_reply) {
                console.log(`Received button response from ${from}:`, {
                    id: interactive.button_reply.id,
                    title: interactive.button_reply.title
                });
            }
            break;
        case 'list':
            if (interactive.list_reply) {
                console.log(`Received list response from ${from}:`, {
                    id: interactive.list_reply.id,
                    title: interactive.list_reply.title,
                    description: interactive.list_reply.description
                });
            }
            break;
        default:
            console.log(`Unhandled interactive message type: ${interactive.type}`);
    }
}

interface NFMResponseData {
    flow_token: string;
    [key: string]: any; // For optional parameters
}

async function handleNFMResponse(
    from: string,
    responseData: NFMResponseData,
    context?: WhatsAppMessageContext
): Promise<void> {
    const { flow_token, ...optionalParams } = responseData;

    console.log('Processing NFM response:', {
        from,
        flow_token,
        optionalParams,
        context
    });

    // Processing NFM response: {
    //     from: '917284935626',
    //         flow_token: 'flows-builder-41b29403',
    //         optionalParams: {
    //         fullName: 'Gy',
    //             email: 'Tt@gt.com',
    //             passType: '3_One_day_combo_pass'
    //     },
    //     context: {
    //         from: '919316197988',
    //             id: 'wamid.HBgMOTE3Mjg0OTM1NjI2FQIAERgSMEY0MTVCRDgzMzREMjkzNTY0AA=='
    //     }
    // }

    const passAmounts = {
            "0_One_day": 500,
            "1_Two__day": 800,
            "2_All_day_combo_pass": 1200,
            "3_One_day_combo_pass": 700

    }



    // Add your NFM response handling logic here
    // For example:
    // - Validate flow token
    // - Process optional parameters
    // - Send follow-up messages
    // - Update flow state


        // call onboard api
//     curl --location '@⁨Yash Desai⁩
//  https://whatsapp-boat.onrender.com/user/onboard
// api for onboard user' \
// --header 'Content-Type: application/json' \
// --data '{
//     "number":"mehul",
//         "channel":"forest",
//         "onBoardThrough":"instagram"
// }'

    const userData: OnboardRequest = {
        number: from,
        channel: 'urban_forest_registration',
        onBoardThrough: 'whatsapp',
    };

        await onboardUser(userData);


        console.log('Processing NFM response:', {
            from,
            flow_token,
            optionalParams,
            context
        });

        // Create Razorpay instance
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!
        });

        try {
            // Create payment link
            // @ts-ignore
            const passAmt:number = passAmounts[optionalParams?.passType]
            const paymentLink = await razorpay.paymentLink.create({
                upi_link: true,
                amount: passAmt*100 , // Amount in paise (optionalParams.amount in currency units)
                currency: 'INR',
                accept_partial: false,
                description: 'Payment for your order',
                customer: {
                    name: optionalParams.fullName,
                    contact: from,
                    email: optionalParams.email
                },
                notes: {
                    customer_contact: from,
                    fullName: optionalParams.fullName, email: optionalParams.email, passType: optionalParams.passType
                },
                notify: {
                    sms: false,
                    email: false
                },
                callback_url: "https://wa.me/919316197988?text=",
                callback_method: 'get',

            });

            console.log('Payment link created:', paymentLink);

            // Send payment link back to the user via WhatsApp
            const url = 'https://graph.facebook.com/v16.0/514294548440290/messages';
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: from,
                type: 'interactive',
                interactive: {
                    type: 'cta_url',
                    body: {
                        text: 'Click below to make payment'
                    },
                    action: {
                        // buttons: [
                        //     {
                        //         type: 'url',
                        //         url: paymentLink.short_url,
                        //         title: 'Pay Now'
                        //     }
                        // ]
                        "name": "cta_url",
                        "parameters": {
                            "display_text": "Pay Now",
                            "url": paymentLink.short_url
      
                        }
                    }
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('Failed to send payment link:', await response.text());
            }
        } catch (error) {
            console.error('Error creating Razorpay payment link:', error);
        }

}


interface OnboardRequest {
    number: string;
    channel: string;
    onBoardThrough: string;
}


const onboardUser = async (data: OnboardRequest): Promise<void> => {
    const apiUrl = 'https://whatsapp-boat.onrender.com/user/onboard';
    try {
        const response = await axios.post(apiUrl, data, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        console.log('Response:', response.data);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Axios Error:', error.response?.data || error.message);
        } else {
            console.error('Unexpected Error:', error);
        }
    }
};

export default router;