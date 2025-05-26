const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());
const port = process.env.PORT || 3123;

let isWhatsAppReady = false;
let pendingMessages = [];

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

async function sendPendingMessages() {
    if (!isWhatsAppReady) return;
    
    console.log(`Mencoba mengirim ${pendingMessages.length} pesan tertunda`);
    
    while (pendingMessages.length > 0) {
        const { number, message, responseCallback } = pendingMessages.shift();
        
        try {
            const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;
            await client.sendMessage(formattedNumber, message);
            responseCallback({ 
                success: true, 
                message: 'OTP berhasil dikirim ke WhatsApp', 
                phoneNumber: number.split('@')[0] 
            });
        } catch (error) {
            console.error('Error mengirim pesan tertunda:', error);
            responseCallback({ 
                success: false, 
                message: 'Gagal mengirim OTP', 
                error: error.message 
            });
        }
    }
}

client.on('qr', (qr) => {
    console.log('QR CODE:');
    qrcode.generate(qr, { small: true });
    console.log('Silakan scan QR code di atas untuk login ke WhatsApp.');
});

client.on('ready', () => {
    console.log('Bot WhatsApp siap digunakan!');
    console.log('port: ', port);;
    isWhatsAppReady = true;
    sendPendingMessages();
});

client.on('disconnected', (reason) => {
    console.log('Bot WhatsApp terputus:', reason);
    isWhatsAppReady = false;
});

app.get('/status', (req, res) => {
    res.json({
        whatsappConnected: isWhatsAppReady,
        pendingMessages: pendingMessages.length
    });
});

app.post('/send-otp', async (req, res) => {
    try {
        const { phoneNumber, otpCode } = req.body;
        
        if (!phoneNumber || !otpCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nomor telepon dan kode OTP diperlukan' 
            });
        }
        
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (!formattedNumber.includes('@c.us')) {
            formattedNumber = `${formattedNumber}@c.us`;
        }
        
        const messageText = `Kode OTP Anda adalah: ${otpCode}\n\nJangan bagikan kode ini kepada siapapun.`;
        
        if (isWhatsAppReady) {
            try {
                await client.sendMessage(formattedNumber, messageText);
                
                res.status(200).json({
                    success: true,
                    message: 'OTP berhasil dikirim ke WhatsApp',
                    phoneNumber: phoneNumber
                });
            } catch (error) {
                console.error('Error mengirim pesan:', error);
                res.status(500).json({ 
                    success: false, 
                    message: 'Terjadi kesalahan saat mengirim OTP',
                    error: error.message
                });
            }
        } else {
            pendingMessages.push({
                number: formattedNumber,
                message: messageText,
                responseCallback: (response) => {
                    if (res.headersSent) return;
                    
                    if (response.success) {
                        res.json(response);
                    } else {
                        res.status(500).json(response);
                    }
                }
            });
            
            res.json({
                success: true,
                message: 'Pesan OTP ditambahkan ke antrian dan akan dikirim segera setelah WhatsApp terhubung',
                status: 'pending',
                phoneNumber: phoneNumber
            });
        }
    } catch (error) {
        console.error('Error pada endpoint send-otp:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan saat memproses permintaan OTP',
            error: error.message
        });
    }
});

client.initialize();

app.listen(port, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${port}`);
});