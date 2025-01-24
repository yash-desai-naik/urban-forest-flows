import express, { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import pdfkit from "pdfkit";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";

const router = express.Router();

// Verify Razorpay webhook signature
const verifyRazorpaySignature = (req: Request): boolean => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        console.error("Missing Razorpay webhook secret.");
        return false;
    }

    const webhookSignature = req.headers["x-razorpay-signature"];
    if (!webhookSignature) return false;

    const reqBody = JSON.stringify(req.body);
    const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(reqBody)
        .digest("hex");

    return generatedSignature === webhookSignature;
};

// Route for Razorpay webhook
// @ts-ignore
router.post("/razorpay-webhook", async (req: Request, res: Response) => {
    try {
        // Verify webhook signature
        if (!verifyRazorpaySignature(req)) {
            return res.status(403).send("Invalid Razorpay signature.");
        }

        console.log("payload$####", req.body);

        const { event, payload } = req.body;

        // Handle payment successful event
        if (event === "payment.captured") {
            const payment = payload.payment.entity;

            // Generate a ticket PDF
            const pdfPath = await generateTicketPDF({
                name: payment.notes.name,
                email: payment.email,
                contact: payment.notes.customer_contact||payment.contact,
                amount: payment.amount / 100, // Convert paise to INR
                paymentId: payment.id,

            });

            // Send ticket back via WhatsApp
            await sendTicketToWhatsApp(payment.contact, pdfPath);
        }

        res.status(200).send("Webhook handled successfully.");
    } catch (error) {
        console.error("Error handling Razorpay webhook:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Function to generate Ticket PDF
const generateTicketPDF = (data: {
    name: string;
    email: string;
    contact: string;
    amount: number;
    paymentId: string;
}): Promise<string> => {
    return new Promise((resolve, reject) => {
        try {
            const pdfDoc = new pdfkit();
            const filePath = `./tickets/Ticket-${data.paymentId}.pdf`;

            // Create writable stream
            const writeStream = fs.createWriteStream(filePath);
            pdfDoc.pipe(writeStream);

            // Add PDF content
            pdfDoc.fontSize(20).text("Event Ticket", { align: "center" });
            pdfDoc.moveDown();
            pdfDoc.text(`Name: ${data.name}`);
            pdfDoc.text(`Email: ${data.email}`);
            pdfDoc.text(`Contact: ${data.contact}`);
            pdfDoc.text(`Amount Paid: ₹${data.amount}`);
            pdfDoc.text(`Payment ID: ${data.paymentId}`);

            // Finalize PDF
            pdfDoc.end();

            // Resolve path when finished writing
            writeStream.on("finish", () => resolve(filePath));
            writeStream.on("error", reject);
        } catch (error) {
            reject(error);
        }
    });
};

// Function to send Ticket PDF to WhatsApp
// Function to send Ticket PDF URL to WhatsApp
async function sendTicketToWhatsApp(contact: string, pdfPath: string): Promise<void> {
    try {
        const url = `https://graph.facebook.com/v16.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

        // Let's assume your server provides a base public URL for accessing files
        const publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
        const pdfUrl = `${publicBaseUrl}/tickets/${pdfPath.split("/").pop()}`;

        console.log("Ticket URL:", pdfUrl)

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: contact,
            // type: "text",
            "type": "document",
            // text: {
            //     body: `Thank you for your payment! Here is your ticket: ${pdfUrl}`,
            // },
            "document": {
                "link": pdfUrl,
                "filename": "Ticket.pdf"
            }
        };

        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                "Content-Type": "application/json",
            },
        });

        if (response.status === 200) {
            console.log(`Ticket URL sent successfully to WhatsApp contact: ${contact}`);
        } else {
            throw new Error(
                `Failed to send WhatsApp message: ${response.status} - ${response.statusText}`
            );
        }
    } catch (error: any) {
        console.error("Error sending ticket URL to WhatsApp:", error?.response?.data || error.message);
        throw error;
    }
}
export default router;