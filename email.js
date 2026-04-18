const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY || 're_Q1L7cooz_49L4uvJLFj5BTCx3atmMeW1u');

// Email templates
const EMAIL_TEMPLATES = {
    // Order confirmation email
    orderConfirmation: (order, customerName) => ({
        subject: '✅ הזמנה התקבלה - VEXO Gaming Store',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; }
                    .logo { font-size: 24px; font-weight: bold; color: #ff0000; }
                    .order-info { background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; }
                    .order-id { font-size: 18px; font-weight: bold; color: #333; }
                    .total { font-size: 24px; font-weight: bold; color: #4caf50; margin-top: 20px; }
                    .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
                    .btn { display: inline-block; padding: 12px 30px; background-color: #ff0000; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🎮 VEXO Gaming Store</div>
                    </div>
                    <h2>שלום ${customerName}!</h2>
                    <p>הזמנה שלך התקבלה בהצלחה!</p>
                    
                    <div class="order-info">
                        <div class="order-id">מספר הזמנה: #${order.id}</div>
                        <p><strong>תאריך:</strong> ${new Date(order.created_at).toLocaleDateString('he-IL')}</p>
                        <p><strong>כתובת למשלוח:</strong> ${order.shipping_address}</p>
                    </div>
                    
                    <h3>פרטי ההזמנה:</h3>
                    ${JSON.parse(order.items_json).map(item => `
                        <div style="padding: 10px 0; border-bottom: 1px solid #eee;">
                            <strong>${item.name}</strong><br>
                            כמות: ${item.quantity || 1} | מחיר: ₪${item.price}
                        </div>
                    `).join('')}
                    
                    <div class="total">סה"כ: ₪${order.revenue}</div>
                    
                    <p>אנו נעדכן אותך כשההזמנה תישלח.</p>
                    
                    <div class="footer">
                        <p>© 2024 VEXO Gaming Store. כל הזכויות שמורות.</p>
                        <p>אם יש לך שאלות, צור קשר: Shalevamir1410@gmail.com</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Shipping update email
    shippingUpdate: (order, trackingNumber, carrier) => ({
        subject: '📦 ההזמנה שלך נשלחה! - VEXO Gaming Store',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; }
                    .logo { font-size: 24px; font-weight: bold; color: #ff0000; }
                    .tracking-info { background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
                    .tracking-number { font-size: 18px; font-weight: bold; color: #4caf50; }
                    .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🎮 VEXO Gaming Store</div>
                    </div>
                    <h2>חדשות טובות! 🎉</h2>
                    <p>ההזמנה שלך נשלחה!</p>
                    
                    <div class="tracking-info">
                        <p><strong>מספר הזמנה:</strong> #${order.id}</p>
                        <p class="tracking-number">מספר מעקב: ${trackingNumber}</p>
                        <p><strong>חברת משלוח:</strong> ${carrier}</p>
                    </div>
                    
                    <p>אתה יכול לעקוב אחרי ההזמנה באמצעות מספר המעקב.</p>
                    
                    <div class="footer">
                        <p>© 2024 VEXO Gaming Store. כל הזכויות שמורות.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Chat reply email
    // Order receipt email
    orderReceipt: ({orderNumber, customerName, items, total}) => ({
        subject: `🧾 קבלה מס' ${orderNumber} - VEXO Gaming Store`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ff0000; padding-bottom: 20px; }
                    .logo { font-size: 28px; font-weight: bold; color: #ff0000; margin-bottom: 10px; }
                    .title { font-size: 18px; color: #333; }
                    .info { margin-bottom: 30px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 10px; background: #f9f9f9; border-radius: 5px; }
                    .info-label { font-weight: bold; color: #666; }
                    .info-value { color: #333; }
                    .items { margin-bottom: 30px; }
                    .items-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #333; }
                    .item { display: flex; justify-content: space-between; padding: 15px; background: #f9f9f9; margin-bottom: 10px; border-radius: 5px; }
                    .item-name { flex: 1; }
                    .item-qty { width: 80px; text-align: center; color: #666; }
                    .item-price { width: 100px; text-align: left; color: #333; }
                    .total { margin-top: 30px; padding: 20px; background: #1a0a0a; color: white; border-radius: 5px; display: flex; justify-content: space-between; font-size: 20px; font-weight: bold; }
                    .footer { text-align: center; margin-top: 40px; color: #888; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🎮 VEXO Gaming Store</div>
                        <div class="title">קבלה מס' ${orderNumber}</div>
                    </div>
                    
                    <div class="info">
                        <div class="info-row">
                            <span class="info-label">שם הלקוח:</span>
                            <span class="info-value">${customerName}</span>
                        </div>
                    </div>
                    
                    <div class="items">
                        <div class="items-title">פריטים בהזמנה</div>
                        ${items.map(item => `
                            <div class="item">
                                <div class="item-name">${item.name || item.product_name || 'מוצר'}</div>
                                <div class="item-qty">x${item.quantity || 1}</div>
                                <div class="item-price">₪${(item.price * (item.quantity || 1)).toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="total">
                        <span>סה"כ לתשלום:</span>
                        <span>₪${total.toFixed(2)}</span>
                    </div>
                    
                    <div class="footer">
                        <p>VEXO Gaming Store</p>
                        <p>תודה על הזמנתך!</p>
                        <p>אתר: vexo-gaming-store.onrender.com</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    chatReply: ({name, reply}) => ({
        subject: `📧 תגובה מ-VEXO Gaming Store`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; }
                    .logo { font-size: 24px; font-weight: bold; color: #ff0000; }
                    .reply-box { background-color: #f9f9f9; padding: 20px; border-radius: 8px; border-right: 4px solid #ff0000; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🎮 VEXO Gaming Store</div>
                    </div>
                    <h2>היי ${name}!</h2>
                    <p>קיבלנו את ההודעה שלך בצ'אט ורצינו להגיב:</p>
                    
                    <div class="reply-box">
                        <p style="margin: 0; font-size: 16px; line-height: 1.6;">${reply}</p>
                    </div>
                    
                    <p>אם יש לך שאלות נוספות, אל תהסס לכתוב לנו שוב!</p>
                    
                    <div class="footer">
                        <p>VEXO Gaming Store</p>
                        <p>אתר: <a href="https://vexo-gaming-store.onrender.com" style="color: #ff0000;">vexo-gaming-store.onrender.com</a></p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Password reset email
    passwordReset: ({resetLink}) => ({
        subject: `🔑 איפוס סיסמה - ${resetLink}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; }
                    .logo { font-size: 24px; font-weight: bold; color: #ff0000; }
                    .reset-btn { display: inline-block; padding: 15px 40px; background-color: #ff0000; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-size: 16px; }
                    .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🎮 VEXO Gaming Store</div>
                    </div>
                    <h2>איפוס סיסמה</h2>
                    <p>ביקשת לאפס את הסיסמה שלך.</p>
                    <p>לחץ על הכפתור למטה כדי לאפס את הסיסמה:</p>
                    
                    <table border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
                        <tr>
                            <td align="center" bgcolor="#007bff" style="border-radius: 5px;">
                                <a href="${resetLink}" style="
                                    background-color: #007bff;
                                    color: white;
                                    padding: 15px 30px;
                                    text-decoration: none;
                                    display: inline-block;
                                    font-weight: bold;
                                    font-size: 16px;
                                    border-radius: 5px;
                                ">לחץ כאן לאיפוס סיסמה</a>
                            </td>
                        </tr>
                    </table>
                    
                    <p style="font-size: 12px; color: #666;">אם הכפתור לא עובד, העתק והדבק את הקישור הבא בדפדפן:</p>
                    <p style="word-break: break-all; font-size: 11px; color: #0066cc;">${encodeURI(resetLink)}</p>
                    
                    <p>הלינק תקף ל-24 שעות.</p>
                    <p>אם לא ביקשת איפוס סיסמה, התעלם מהודעה זו.</p>
                    
                    <hr style="margin: 30px 0;">
                    
                    <p>אם הכפתור למעלה לא מגיב, העתק והדבק את הכתובת המלאה הבאה בדפדפן שלך:</p>
                    <br><br>
                    <p style="word-break: break-all; font-size: 14px;">${resetLink}</p>
                    
                    <div class="footer">
                        <p>© 2024 VEXO Gaming Store. כל הזכויות שמורות.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    })
};

// Send email function
async function sendEmail(to, templateType, data) {
    try {
        console.log('📧 Attempting to send email to:', to);
        console.log('📧 Template type:', templateType);
        console.log('📧 API Key configured:', !!process.env.RESEND_API_KEY);
        
        if (!process.env.RESEND_API_KEY && !resend.apiKey) {
            console.log('⚠️ No Resend API key configured, skipping email');
            return { success: false, error: 'No API key' };
        }

        const template = EMAIL_TEMPLATES[templateType];
        if (!template) {
            throw new Error(`Template ${templateType} not found`);
        }

        const { subject, html } = template(data);

        console.log('📧 Sending email with subject:', subject);
        
        const result = await resend.emails.send({
            from: 'VEXO Gaming Store <onboarding@resend.dev>',
            to: to,
            subject: subject,
            html: html
        });

        console.log('✅ Email sent successfully:', result);
        return { success: true, result };
    } catch (error) {
        console.error('❌ Error sending email:', error);
        console.error('❌ Error details:', error.message);
        console.error('❌ Error stack:', error.stack);
        return { success: false, error: error.message };
    }
}

// Specific email functions
async function sendOrderConfirmation(order, customerEmail, customerName) {
    return await sendEmail(customerEmail, 'orderConfirmation', { order, customerName });
}

async function sendShippingUpdate(order, trackingNumber, carrier, customerEmail) {
    return await sendEmail(customerEmail, 'shippingUpdate', { order, trackingNumber, carrier });
}

async function sendPasswordReset(email, resetLink) {
    return await sendEmail(email, 'passwordReset', { resetLink });
}

module.exports = {
    sendEmail,
    sendOrderConfirmation,
    sendShippingUpdate,
    sendPasswordReset
};

