const express = require('express');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const multer = require('multer');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file (for local development)
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vexo-gaming-store-secret-key';

// Trust proxy (required for ngrok and reverse proxies)
app.set('trust proxy', true);

// CORS - Allow all origins (ngrok domains change every time)
app.use(cors({
    origin: true,  // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// Store for DSers connections (persists even when ngrok changes)
const dsersConnections = new Map();

// Helper to get the actual server URL (works with ngrok)
function getServerUrl(req) {
    // Check for ngrok forwarded host
    const forwardedHost = req.headers['x-forwarded-host'];
    const forwardedProto = req.headers['x-forwarded-proto'] || 'http';
    
    if (forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }
    
    // Fallback to request headers
    const host = req.headers.host || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    return `${protocol}://${host}`;
}

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Create uploads directory if not exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Database connection
const db = new sqlite3.Database('./database.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// Helper script to fake a WooCommerce store connection for DSers
// This creates a fake WooCommerce site that DSers can connect to
class FakeWooCommerceConnector {
    constructor() {
        this.storeUrl = null;
        this.consumerKey = null;
        this.consumerSecret = null;
    }

    // Generate fake WooCommerce credentials
    generateFakeCredentials() {
        const crypto = require('crypto');
        
        // Generate fake consumer key and secret
        this.consumerKey = 'ck_' + crypto.randomBytes(24).toString('hex');
        this.consumerSecret = 'cs_' + crypto.randomBytes(24).toString('hex');
        
        // Use the actual server URL as the "store" URL
        this.storeUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
        
        console.log('🎭 Generated fake WooCommerce credentials for DSers:');
        console.log('Store URL:', this.storeUrl);
        console.log('Consumer Key:', this.consumerKey);
        console.log('Consumer Secret:', this.consumerSecret);
        
        return {
            storeUrl: this.storeUrl,
            consumerKey: this.consumerKey,
            consumerSecret: this.consumerSecret
        };
    }

    // Create fake WooCommerce API endpoints that DSers expects
    setupFakeEndpoints(app) {
        // WooCommerce authentication check endpoint
        app.get('/wp-json/wc/v3/system_status', (req, res) => {
            res.json({
                environment: { name: 'VEXO Store' },
                settings: { currency: 'ILS' }
            });
        });

        // WooCommerce orders endpoint - returns fake orders
        app.get('/wp-json/wc/v3/orders', (req, res) => {
            res.json([
                {
                    id: 1,
                    status: 'processing',
                    total: '100.00',
                    currency: 'ILS'
                }
            ]);
        });

        // WooCommerce products endpoint
        app.get('/wp-json/wc/v3/products', (req, res) => {
            res.json([]);
        });

        console.log('🎭 Fake WooCommerce endpoints set up at /wp-json/wc/v3/');
    }
}

// Simple health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// WooCommerce REST API endpoints that DSers checks
// These make DSers think this is a real WooCommerce store

// WordPress REST API root
app.get('/wp-json', (req, res) => {
    res.json({
        name: 'VEXO Store',
        description: 'WooCommerce Store',
        url: 'https://vexo-store.com',
        home: 'https://vexo-store.com',
        gmt_offset: 0,
        timezone_string: 'UTC',
        namespaces: ['wp/v2', 'wc/v3', 'wc/v2'],
        authentication: [],
        routes: {
            '/wc/v3': {
                namespace: 'wc/v3',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
            }
        }
    });
});

// WooCommerce API root
app.get('/wp-json/wc/v3', (req, res) => {
    res.json({
        namespace: 'wc/v3',
        routes: {
            '/wc/v3/orders': {
                methods: ['GET', 'POST'],
                endpoints: [
                    { methods: ['GET'], args: [] },
                    { methods: ['POST'], args: [] }
                ]
            },
            '/wc/v3/products': {
                methods: ['GET', 'POST'],
                endpoints: [
                    { methods: ['GET'], args: [] },
                    { methods: ['POST'], args: [] }
                ]
            }
        }
    });
});

// WooCommerce system status - DSers checks this to verify store
app.get('/wp-json/wc/v3/system_status', (req, res) => {
    res.json({
        environment: {
            home_url: 'https://vexo-store.com',
            site_url: 'https://vexo-store.com',
            wc_version: '7.0.0',
            wp_version: '6.0',
            server_info: 'nginx/1.20',
            php_version: '8.0',
            mysql_version: '8.0',
            theme: 'Storefront'
        },
        settings: {
            currency: 'ILS',
            currency_symbol: '₪',
            currency_position: 'right_space',
            thousand_separator: ',',
            decimal_separator: '.',
            number_of_decimals: 2
        }
    });
});

// WooCommerce orders endpoint
app.get('/wp-json/wc/v3/orders', (req, res) => {
    res.json([]);
});

// WooCommerce products endpoint
app.get('/wp-json/wc/v3/products', (req, res) => {
    res.json([]);
});

// WooCommerce customers endpoint
app.get('/wp-json/wc/v3/customers', (req, res) => {
    res.json([]);
});

// WooCommerce Authorization endpoint - DSers calls this to authorize the app
app.get('/wc-auth/v1/authorize', (req, res) => {
    const { app_name, scope, user_id, return_url, callback_url } = req.query;
    
    console.log('🔑 DSers WooCommerce Auth Request:', {
        app_name,
        scope,
        user_id,
        return_url,
        callback_url,
        timestamp: new Date().toISOString()
    });
    
    // Generate fake keys
    const crypto = require('crypto');
    const consumerKey = 'ck_' + crypto.randomBytes(24).toString('hex');
    const consumerSecret = 'cs_' + crypto.randomBytes(24).toString('hex');
    
    // Return success response immediately
    res.status(200).json({
        success: true,
        message: 'Authorization successful',
        data: {
            key_id: 1,
            user_id: user_id || 1,
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
            key_permissions: scope || 'read_write',
            app_name: app_name || 'DSers'
        }
    });
    
    console.log('✅ Authorization response sent to DSers');
});

// Alternative: POST version for DSers
app.post('/wc-auth/v1/authorize', (req, res) => {
    const { app_name, scope, user_id, return_url, callback_url } = req.body;
    
    console.log('🔑 DSers WooCommerce Auth POST Request:', {
        app_name,
        scope,
        user_id,
        return_url,
        callback_url
    });
    
    const crypto = require('crypto');
    const consumerKey = 'ck_' + crypto.randomBytes(24).toString('hex');
    const consumerSecret = 'cs_' + crypto.randomBytes(24).toString('hex');
    
    res.status(200).json({
        success: true,
        message: 'Authorization successful',
        data: {
            key_id: 1,
            user_id: user_id || 1,
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
            key_permissions: scope || 'read_write',
            app_name: app_name || 'DSers'
        }
    });
});
function saveDsersConnection(connectionData) {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS dsers_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consumer_key TEXT NOT NULL,
                consumer_secret TEXT NOT NULL,
                user_id INTEGER,
                scope TEXT,
                callback_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating dsers_connections table:', err);
                return reject(err);
            }
            
            db.run(`
                INSERT INTO dsers_connections (consumer_key, consumer_secret, user_id, scope, callback_url)
                VALUES (?, ?, ?, ?, ?)
            `, [
                connectionData.consumer_key,
                connectionData.consumer_secret,
                connectionData.user_id,
                connectionData.scope,
                connectionData.callback_url
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    });
}

// Get last DSers connection
function getLastDsersConnection() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM dsers_connections 
            ORDER BY created_at DESC 
            LIMIT 1
        `, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// WooCommerce Authorization endpoint - DSers calls this to authorize the app
app.get('/wc-auth/v1/authorize', async (req, res) => {
    const { app_name, scope, user_id, return_url, callback_url } = req.query;
    
    // Get actual server URL (works with ngrok)
    const serverUrl = getServerUrl(req);
    
    console.log('🔑 DSers WooCommerce Auth Request:', {
        app_name,
        scope,
        user_id,
        return_url,
        callback_url,
        server_url: serverUrl,
        timestamp: new Date().toISOString()
    });
    
    // Generate fake keys for DSers
    const keyId = Math.floor(Math.random() * 1000000);
    const consumerKey = 'ck_' + require('crypto').randomBytes(24).toString('hex');
    const consumerSecret = 'cs_' + require('crypto').randomBytes(24).toString('hex');
    
    // Return success response that DSers expects
    const authResponse = {
        key_id: keyId,
        user_id: user_id || 1,
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        key_permissions: scope || 'read_write',
        app_name: app_name || 'DSers'
    };
    
    // Save connection to database
    try {
        await saveDsersConnection({
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
            user_id: user_id || 1,
            scope: scope || 'read_write',
            callback_url: callback_url || null
        });
        console.log('💾 DSers connection saved to database');
    } catch (err) {
        console.error('Failed to save DSers connection:', err.message);
    }
    
    // If callback_url provided, send data there
    if (callback_url) {
        console.log('📤 Sending auth data to callback:', callback_url);
        try {
            await axios.post(callback_url, authResponse);
            console.log('✅ Auth data sent to callback successfully');
        } catch (err) {
            console.log('⚠️ Could not send to callback (this is OK):', err.message);
        }
    }
    
    // Return success to DSers
    res.status(200).json({
        success: true,
        message: 'Authorization successful',
        data: authResponse
    });
});

// Alternative: POST version of authorize
app.post('/wc-auth/v1/authorize', (req, res) => {
    const { app_name, scope, user_id, return_url, callback_url } = req.body;
    
    console.log('🔑 DSers WooCommerce Auth POST Request:', {
        app_name,
        scope,
        user_id,
        return_url,
        callback_url
    });
    
    const keyId = Math.floor(Math.random() * 1000000);
    const consumerKey = 'ck_' + require('crypto').randomBytes(24).toString('hex');
    const consumerSecret = 'cs_' + require('crypto').randomBytes(24).toString('hex');
    
    res.status(200).json({
        success: true,
        message: 'Authorization successful',
        data: {
            key_id: keyId,
            user_id: user_id || 1,
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
            key_permissions: scope || 'read_write',
            app_name: app_name || 'DSers'
        }
    });
});

// WooCommerce REST API key endpoint
app.post('/wp-json/wc/v3/settings/general', (req, res) => {
    res.json({
        woocommerce_currency: 'ILS',
        woocommerce_currency_pos: 'right_space',
        woocommerce_price_thousand_sep: ',',
        woocommerce_price_decimal_sep: '.',
        woocommerce_price_num_decimals: 2
    });
});

// Initialize fake connector
const fakeWoo = new FakeWooCommerceConnector();

// API endpoint to get fake WooCommerce credentials for DSers
app.get('/api/admin/fake-woocommerce-creds', authenticateAdmin, (req, res) => {
    const creds = fakeWoo.generateFakeCredentials();
    fakeWoo.setupFakeEndpoints(app);
    res.json({
        success: true,
        message: 'Fake WooCommerce credentials generated',
        credentials: creds,
        instructions: [
            '1. Copy the Store URL',
            '2. Copy the Consumer Key',
            '3. Copy the Consumer Secret',
            '4. Paste them in DSers when it asks for WooCommerce store',
            '5. DSers will think it connected to a real store!'
        ]
    });
});

// DSers Open API Service
// מיקום: DSers Dashboard → Settings → Open API → Create App
// כתובת: https://www.dsers.com/settings/open-api
class DSersApiService {
    constructor() {
        this.appKey = process.env.DSERS_APP_KEY || '';
        this.appSecret = process.env.DSERS_APP_SECRET || '';
        this.baseUrl = 'https://openapi.dsers.com/api';
        this.accessToken = null;
    }

    // Generate signature for API calls
    generateSignature(params) {
        const crypto = require('crypto');
        const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {});
        
        let signString = this.appSecret;
        for (const [key, value] of Object.entries(sortedParams)) {
            signString += key + value;
        }
        signString += this.appSecret;
        
        return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
    }

    // Get access token using App Key and App Secret
    async authenticate() {
        if (!this.appKey || !this.appSecret) {
            console.log('DSers API: Missing App Key or App Secret');
            return false;
        }

        try {
            const params = {
                appKey: this.appKey,
                timestamp: Date.now().toString()
            };
            
            params.sign = this.generateSignature(params);

            const response = await axios.post(`${this.baseUrl}/auth/token`, params);
            
            if (response.data && response.data.accessToken) {
                this.accessToken = response.data.accessToken;
                console.log('✅ DSers API authenticated successfully');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('DSers API authentication failed:', error.message);
            return false;
        }
    }

    // Fetch orders from DSers
    async getOrders(page = 1, pageSize = 50) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const params = {
                appKey: this.appKey,
                accessToken: this.accessToken,
                timestamp: Date.now().toString(),
                page: page.toString(),
                pageSize: pageSize.toString()
            };
            
            params.sign = this.generateSignature(params);

            const response = await axios.get(`${this.baseUrl}/orders`, { params });
            return response.data;
        } catch (error) {
            console.error('DSers getOrders error:', error.message);
            return null;
        }
    }

    // Fetch specific order details with tracking info
    async getOrderDetails(orderId) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const params = {
                appKey: this.appKey,
                accessToken: this.accessToken,
                timestamp: Date.now().toString(),
                orderId: orderId.toString()
            };
            
            params.sign = this.generateSignature(params);

            const response = await axios.get(`${this.baseUrl}/orders/details`, { params });
            return response.data;
        } catch (error) {
            console.error('DSers getOrderDetails error:', error.message);
            return null;
        }
    }

    // Sync tracking numbers from DSers to local orders
    async syncTrackingNumbers() {
        console.log('🔄 Syncing tracking numbers from DSers...');
        
        const orders = await this.getOrders(1, 100);
        if (!orders || !orders.data || !orders.data.list) {
            console.log('No orders found from DSers');
            return { updated: 0, errors: 0 };
        }

        let updated = 0;
        let errors = 0;

        for (const dsersOrder of orders.data.list) {
            try {
                // Check if order has tracking info
                if (!dsersOrder.trackingNumber && !dsersOrder.logistic_no) {
                    continue;
                }

                const trackingNumber = dsersOrder.trackingNumber || dsersOrder.logistic_no;
                const carrier = dsersOrder.logisticName || dsersOrder.carrier || 'israel_post';
                const cjOrderId = dsersOrder.cjOrderId || dsersOrder.orderId;

                // Find matching local order
                const localOrder = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT * FROM orders WHERE cj_order_id = ? OR payment_id LIKE ?',
                        [cjOrderId, `%${dsersOrder.orderId}%`],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });

                if (localOrder && !localOrder.trackingNumber) {
                    // Update local order with tracking info
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE orders SET 
                                trackingNumber = ?, 
                                carrier = ?, 
                                tracking_status = 'pending',
                                last_tracking_check = ?
                             WHERE id = ?`,
                            [trackingNumber, carrier, new Date().toISOString(), localOrder.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    console.log(`✅ Updated order #${localOrder.id} with tracking: ${trackingNumber}`);
                    updated++;
                }
            } catch (err) {
                console.error(`Error syncing order ${dsersOrder.orderId}:`, err.message);
                errors++;
            }
        }

        console.log(`🎉 Sync complete: ${updated} orders updated, ${errors} errors`);
        return { updated, errors };
    }
}

// Initialize DSers API Service
const dsersApi = new DSersApiService();

// Cron job for automatic DSers sync (every 30 minutes)
cron.schedule('*/30 * * * *', async () => {
    console.log('🔄 Running scheduled DSers tracking sync...');
    try {
        await dsersApi.syncTrackingNumbers();
    } catch (error) {
        console.error('DSers sync cron error:', error.message);
    }
});

// API endpoint for manual DSers sync
app.post('/api/admin/dsers-sync', authenticateAdmin, async (req, res) => {
    try {
        const result = await dsersApi.syncTrackingNumbers();
        res.json({ 
            success: true, 
            message: `Synced ${result.updated} orders`,
            result 
        });
    } catch (error) {
        console.error('Manual DSers sync error:', error);
        res.status(500).json({ error: 'Sync failed', details: error.message });
    }
});

// API endpoint to update DSers credentials
app.post('/api/admin/dsers-credentials', authenticateAdmin, (req, res) => {
    const { appKey, appSecret } = req.body;
    
    if (!appKey || !appSecret) {
        return res.status(400).json({ error: 'Missing App Key or App Secret' });
    }
    
    // In production, save to environment variables or secure config
    dsersApi.appKey = appKey;
    dsersApi.appSecret = appSecret;
    dsersApi.accessToken = null; // Reset to force re-auth
    
    res.json({ success: true, message: 'Credentials updated. Test connection to verify.' });
});

// Simple test endpoint to verify server is working
app.get('/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        endpoints: [
            '/wp-json',
            '/wp-json/wc/v3',
            '/wp-json/wc/v3/system_status',
            '/wc-auth/v1/authorize'
        ]
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'VEXO Gaming Store',
        type: 'WooCommerce',
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// API endpoint to test DSers connection
app.get('/api/admin/dsers-test', authenticateAdmin, async (req, res) => {
    try {
        const isAuthenticated = await dsersApi.authenticate();
        if (isAuthenticated) {
            const orders = await dsersApi.getOrders(1, 1);
            res.json({ 
                success: true, 
                message: 'Connection successful',
                hasOrders: orders && orders.data && orders.data.list && orders.data.list.length > 0
            });
        } else {
            res.status(401).json({ error: 'Authentication failed. Check your App Key and App Secret.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Test failed', details: error.message });
    }
});

// Tracking Service for Israel Post
class TrackingService {
    static async trackIsraelPost(trackingNumber) {
        try {
            // Israel Post tracking URL
            const url = `https://www.israelpost.co.il/itemtrace.nsf/mainsearch?OpenForm&Lng=HE&itemcode=${trackingNumber}`;
            
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            // Parse the HTML response
            const $ = cheerio.load(response.data);
            const statusRows = $('table tr');
            const events = [];
            
            statusRows.each((i, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 3) {
                    events.push({
                        date: $(cells[0]).text().trim(),
                        time: $(cells[1]).text().trim(),
                        status: $(cells[2]).text().trim(),
                        location: $(cells[3]) ? $(cells[3]).text().trim() : ''
                    });
                }
            });
            
            // Determine overall status
            let status = 'in_transit';
            const lastEvent = events[0];
            if (lastEvent) {
                const statusText = lastEvent.status.toLowerCase();
                if (statusText.includes('נמסר') || statusText.includes('delivered')) {
                    status = 'delivered';
                } else if (statusText.includes('החזר') || statusText.includes('return')) {
                    status = 'returned';
                } else if (statusText.includes('ממתין') || statusText.includes('waiting')) {
                    status = 'pending';
                }
            }
            
            return {
                carrier: 'israel_post',
                trackingNumber,
                status,
                events: events.slice(0, 10), // Last 10 events
                lastUpdate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Israel Post tracking error:', error.message);
            return {
                carrier: 'israel_post',
                trackingNumber,
                status: 'error',
                error: error.message,
                lastUpdate: new Date().toISOString()
            };
        }
    }
    
    static async trackOrder(order) {
        if (!order.trackingNumber) return null;
        
        const carrier = order.carrier || 'israel_post';
        
        switch (carrier) {
            case 'israel_post':
                return await this.trackIsraelPost(order.trackingNumber);
            default:
                return await this.trackIsraelPost(order.trackingNumber);
        }
    }
}

// Cron job for automatic tracking updates (runs every 2 hours)
cron.schedule('0 */2 * * *', async () => {
    console.log('Running automatic tracking update...');
    
    try {
        const orders = await new Promise((resolve, reject) => {
            db.all(`SELECT * FROM orders WHERE trackingNumber IS NOT NULL 
                    AND (tracking_status != 'delivered' OR tracking_status IS NULL)
                    AND (last_tracking_check IS NULL OR 
                         datetime(last_tracking_check) < datetime('now', '-2 hours'))`, 
                [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
        });
        
        console.log(`Found ${orders.length} orders to update`);
        
        for (const order of orders) {
            try {
                const trackingData = await TrackingService.trackOrder(order);
                
                if (trackingData && trackingData.status !== 'error') {
                    db.run('UPDATE orders SET tracking_status = ?, tracking_details = ?, last_tracking_check = ? WHERE id = ?',
                        [trackingData.status, JSON.stringify(trackingData), new Date().toISOString(), order.id]
                    );
                    console.log(`Updated order ${order.id} with status: ${trackingData.status}`);
                }
            } catch (err) {
                console.error(`Failed to update tracking for order ${order.id}:`, err.message);
            }
        }
        
        console.log('Automatic tracking update completed');
    } catch (error) {
        console.error('Automatic tracking update failed:', error);
    }
});

// DSers Webhook - Automatic tracking number update
// DSers sends webhook when tracking number is available
app.post('/webhook/dsers/tracking', async (req, res) => {
    try {
        const { 
            order_id,           // DSers order ID
            tracking_number,    // Tracking number
            carrier,            // Carrier name
            cj_order_id,        // CJ Dropshipping order ID
            status,             // Order status from DSers
            tracking_url        // Optional tracking URL
        } = req.body;
        
        console.log('DSers Webhook received:', {
            order_id,
            tracking_number,
            carrier,
            cj_order_id,
            status,
            tracking_url
        });
        
        // Validate required fields
        if (!tracking_number) {
            return res.status(400).json({ error: 'Missing tracking_number' });
        }
        
        // Find order by CJ order ID or match by other criteria
        let order = null;
        
        if (cj_order_id) {
            order = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM orders WHERE cj_order_id = ?', [cj_order_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
        
        // If not found by CJ order ID, try to find by order_id in notes or payment_id
        if (!order && order_id) {
            order = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM orders WHERE payment_id LIKE ? OR id = ?', 
                    [`%${order_id}%`, order_id], 
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
        }
        
        if (!order) {
            console.log('Order not found for DSers webhook:', { order_id, cj_order_id });
            return res.status(404).json({ 
                error: 'Order not found', 
                received: { order_id, cj_order_id, tracking_number }
            });
        }
        
        // Determine carrier
        let carrierCode = 'israel_post';
        if (carrier) {
            const carrierLower = carrier.toLowerCase();
            if (carrierLower.includes('israel') || carrierLower.includes('דואר')) {
                carrierCode = 'israel_post';
            } else if (carrierLower.includes('fedex')) {
                carrierCode = 'fedex';
            } else if (carrierLower.includes('ups')) {
                carrierCode = 'ups';
            } else if (carrierLower.includes('dhl')) {
                carrierCode = 'dhl';
            } else {
                carrierCode = 'other';
            }
        }
        
        // Update order with tracking info
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE orders SET 
                    trackingNumber = ?, 
                    carrier = ?, 
                    tracking_status = 'pending',
                    last_tracking_check = ?
                 WHERE id = ?`,
                [tracking_number, carrierCode, new Date().toISOString(), order.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Immediately fetch tracking status
        try {
            const trackingData = await TrackingService.trackOrder({
                trackingNumber: tracking_number,
                carrier: carrierCode
            });
            
            if (trackingData && trackingData.status !== 'error') {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE orders SET tracking_status = ?, tracking_details = ? WHERE id = ?',
                        [trackingData.status, JSON.stringify(trackingData), order.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        } catch (trackingError) {
            console.log('Initial tracking fetch failed (will retry later):', trackingError.message);
        }
        
        console.log(`✅ Order #${order.id} updated with tracking: ${tracking_number}`);
        
        res.json({ 
            success: true, 
            message: 'Tracking number updated',
            order_id: order.id,
            tracking_number: tracking_number,
            carrier: carrierCode
        });
        
    } catch (error) {
        console.error('DSers webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed', details: error.message });
    }
});

// Alternative: DSers order status webhook (for order fulfilled events)
app.post('/webhook/dsers/order-status', async (req, res) => {
    try {
        const {
            cj_order_id,
            dsers_order_id,
            status,           // 'fulfilled', 'shipped', etc.
            tracking_info     // Array of tracking info
        } = req.body;
        
        console.log('DSers Order Status Webhook:', { cj_order_id, dsers_order_id, status });
        
        if (status === 'fulfilled' && tracking_info && tracking_info.length > 0) {
            const tracking = tracking_info[0]; // Use first tracking number
            
            // Forward to tracking webhook
            const trackingResponse = await fetch(`http://localhost:${PORT}/webhook/dsers/tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: dsers_order_id,
                    cj_order_id: cj_order_id,
                    tracking_number: tracking.tracking_number,
                    carrier: tracking.carrier_name,
                    tracking_url: tracking.tracking_url
                })
            });
            
            const result = await trackingResponse.json();
            return res.json({ success: true, tracking_updated: result });
        }
        
        res.json({ success: true, message: 'No tracking info to update' });
        
    } catch (error) {
        console.error('DSers order status webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// JWT Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

// Admin middleware
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.email !== 'Shalevamir1410@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.user = user;
        next();
    });
}

// Routes

// Visitor tracking
app.post('/api/track-visitor', (req, res) => {
    db.run('UPDATE stats SET visitor_count = visitor_count + 1 WHERE id = 1', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to track visitor' });
        }
        res.json({ success: true });
    });
});

// Get stats
app.get('/api/stats', authenticateAdmin, (req, res) => {
    db.get('SELECT visitor_count FROM stats', (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get stats' });
        }
        res.json(row || { visitor_count: 0 });
    });
});

// Auth routes
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address, city, zip } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (name, email, password, plain_password, phone, address, city, zip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [name, email, hashedPassword, password, phone, address, city, zip], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: 'Registration failed' });
                }
                
                const token = jwt.sign({ id: this.lastID, email, name }, JWT_SECRET);
                res.json({ token, user: { id: this.lastID, email, name } });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Server error' });
        }
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { code, email } = req.body;
    
    if (code === '0256' && email === 'Shalevamir1410@gmail.com') {
        const token = jwt.sign({ id: 0, email, name: 'Admin' }, JWT_SECRET);
        res.json({ token, user: { id: 0, email, name: 'Admin' } });
    } else {
        res.status(400).json({ error: 'Invalid admin credentials' });
    }
});

// Password reset
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        db.run('UPDATE users SET password = ?, plain_password = ? WHERE email = ?',
            [hashedPassword, newPassword, email],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to reset password' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                res.json({ message: 'Password reset successfully' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Create PayPal order endpoint with redirect URL
app.post('/api/create-order', authenticateToken, async (req, res) => {
    const { amount, product, returnUrl, cancelUrl } = req.body;
    
    try {
        // יצירת הזמנה ב-PayPal עם redirect
        const order = {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: 'ILS',
                    value: amount.toString()
                },
                description: product.name
            }],
            application_context: {
                brand_name: 'VEXO Gaming',
                locale: 'he-IL',
                landing_page: 'NO_PREFERENCE', // או 'BILLING' לכרטיס אשראי ישירות
                user_action: 'PAY_NOW',
                return_url: returnUrl || 'https://vexo-gaming.com/success',
                cancel_url: cancelUrl || 'https://vexo-gaming.com/cancel'
            }
        };
        
        // TODO: קריאה אמיתית ל-PayPal API כדי ליצור order ולקבל approval URL
        // בינתיים נחזיר URL של PayPal checkout עם הפרטים
        const paypalCheckoutUrl = `https://www.paypal.com/checkoutnow?amount=${amount}&currency=ILS&item_name=${encodeURIComponent(product.name)}`;
        
        res.json({ 
            id: 'ORDER_' + Date.now(),
            status: 'CREATED',
            approvalUrl: paypalCheckoutUrl
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Product routes
app.get('/api/products', (req, res) => {
    console.log('GET /api/products - Request received');
    db.all('SELECT * FROM products ORDER BY created_at DESC', (err, products) => {
        if (err) {
            console.error('Database error in products endpoint:', err);
            return res.status(500).json({ error: 'Failed to get products', details: err.message });
        }
        console.log(`Found ${products.length} products`);
        res.json(products);
    });
});

app.post('/api/products', authenticateAdmin, (req, res) => {
    const { sku, name, price, originalPrice, supplierCost, description, category, inStock, pid, vid, provider, supplierLink, image, gallery } = req.body;
    const galleryStr = JSON.stringify(gallery || []);
    
    db.run('INSERT INTO products (sku, name, price, originalPrice, supplierCost, image, gallery, description, category, inStock, pid, vid, provider, supplierLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [sku, name, price, originalPrice, supplierCost, image, galleryStr, description, category, inStock || 1, pid, vid, provider, supplierLink], 
        function(err) {
            if (err) {
                console.error('Error adding product:', err);
                return res.status(500).json({ error: 'Failed to add product', details: err.message });
            }
            res.json({ id: this.lastID, message: 'Product added successfully' });
        }
    );
});

app.put('/api/products/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { sku, name, price, originalPrice, supplierCost, description, category, inStock, pid, vid, provider, supplierLink, image, gallery } = req.body;
    const galleryStr = JSON.stringify(gallery || []);
    
    db.run('UPDATE products SET sku = ?, name = ?, price = ?, originalPrice = ?, supplierCost = ?, image = ?, gallery = ?, description = ?, category = ?, inStock = ?, pid = ?, vid = ?, provider = ?, supplierLink = ? WHERE id = ?', 
        [sku, name, price, originalPrice, supplierCost, image, galleryStr, description, category, inStock, pid, vid, provider, supplierLink, id], 
        function(err) {
            if (err) {
                console.error('Error updating product:', err);
                return res.status(500).json({ error: 'Failed to update product', details: err.message });
            }
            res.json({ message: 'Product updated successfully' });
        }
    );
});

app.delete('/api/products/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete product' });
        }
        res.json({ message: 'Product deleted successfully' });
    });
});

// Cart routes
app.get('/api/cart', authenticateToken, (req, res) => {
    db.get('SELECT cart_json FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get cart' });
        }
        const cart = user.cart_json ? JSON.parse(user.cart_json) : [];
        res.json(cart);
    });
});

app.post('/api/cart', authenticateToken, (req, res) => {
    const { cart } = req.body;
    
    db.run('UPDATE users SET cart_json = ? WHERE id = ?', [JSON.stringify(cart), req.user.id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update cart' });
        }
        res.json({ message: 'Cart updated successfully' });
    });
});

// Order routes
app.get('/api/orders', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, orders) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get orders' });
        }
        res.json(orders);
    });
});

app.post('/api/orders', authenticateToken, (req, res) => {
    const { items, revenue, cost, profit, shippingAddress } = req.body;
    
    const items_json = JSON.stringify(items);
    const product_name = items.map(item => item.name).join(', ');
    
    db.run('INSERT INTO orders (product_name, items_json, revenue, cost, profit, customer_name, customer_email, shipping_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [product_name, items_json, revenue, cost, profit, req.user.name, req.user.email, shippingAddress], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create order' });
            }
            res.json({ id: this.lastID, message: 'Order created successfully' });
        }
    );
});

// Tracking routes
app.put('/api/orders/:id/tracking', authenticateAdmin, (req, res) => {
    const { trackingNumber, carrier } = req.body;
    
    db.run('UPDATE orders SET trackingNumber = ?, carrier = ? WHERE id = ?', 
        [trackingNumber, carrier || 'israel_post', req.params.id], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update tracking' });
            }
            res.json({ message: 'Tracking updated successfully' });
        }
    );
});

// Get tracking status from external service
app.get('/api/orders/:id/tracking-status', authenticateToken, async (req, res) => {
    try {
        const order = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM orders WHERE id = ?', [req.params.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (!order.trackingNumber) {
            return res.json({ status: 'no_tracking', message: 'No tracking number assigned yet' });
        }
        
        // Check if we need to fetch fresh data (older than 2 hours)
        const needsUpdate = !order.last_tracking_check || 
            (new Date() - new Date(order.last_tracking_check)) > 2 * 60 * 60 * 1000;
        
        if (!needsUpdate && order.tracking_status) {
            return res.json({
                trackingNumber: order.trackingNumber,
                carrier: order.carrier,
                status: order.tracking_status,
                details: order.tracking_details ? JSON.parse(order.tracking_details) : null,
                lastUpdate: order.last_tracking_check
            });
        }
        
        // Fetch tracking from 17track API
        const response = await axios.get(`https://www.17track.net/restapi/track`, {
            params: {
                num: order.trackingNumber,
                carrier: order.carrier
            },
            headers: {
                '17trackapikey': process.env.TRACKING_API_KEY || ''
            }
        });
        
        const trackingData = response.data;
        
        // Update database with tracking info
        db.run('UPDATE orders SET tracking_status = ?, tracking_details = ?, last_tracking_check = ? WHERE id = ?',
            [trackingData.status || 'unknown', JSON.stringify(trackingData), new Date().toISOString(), req.params.id]
        );
        
        res.json({
            trackingNumber: order.trackingNumber,
            carrier: order.carrier,
            status: trackingData.status || 'unknown',
            details: trackingData,
            lastUpdate: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Tracking fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch tracking status' });
    }
});

// Bulk tracking update for all pending orders (admin only)
app.post('/api/admin/update-all-tracking', authenticateAdmin, async (req, res) => {
    try {
        const orders = await new Promise((resolve, reject) => {
            db.all(`SELECT * FROM orders WHERE trackingNumber IS NOT NULL 
                    AND (tracking_status != 'Delivered' OR tracking_status IS NULL)
                    AND (last_tracking_check IS NULL OR 
                         datetime(last_tracking_check) < datetime('now', '-2 hours'))`, 
                [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
        });
        
        const results = [];
        
        for (const order of orders) {
            try {
                const response = await axios.get(`https://www.17track.net/restapi/track`, {
                    params: {
                        num: order.trackingNumber,
                        carrier: order.carrier
                    },
                    headers: {
                        '17trackapikey': process.env.TRACKING_API_KEY || ''
                    }
                });
                
                const trackingData = response.data;
                
                await new Promise((resolve, reject) => {
                    db.run('UPDATE orders SET tracking_status = ?, tracking_details = ?, last_tracking_check = ? WHERE id = ?',
                        [trackingData.status || 'unknown', JSON.stringify(trackingData), new Date().toISOString(), order.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                
                results.push({ orderId: order.id, status: 'updated', trackingStatus: trackingData.status });
            } catch (err) {
                results.push({ orderId: order.id, status: 'error', error: err.message });
            }
        }
        
        res.json({ 
            message: `Updated ${results.filter(r => r.status === 'updated').length} orders`,
            results 
        });
        
    } catch (error) {
        console.error('Bulk tracking update error:', error);
        res.status(500).json({ error: 'Failed to update tracking' });
    }
});

// CJ API integration
app.post('/api/import-cj-product', authenticateAdmin, async (req, res) => {
    const { sku } = req.body;
    
    try {
        const response = await axios.get(`https://api.cjdropshipping.com/product/api/product/query?apiKey=${CJ_API_KEY}&sku=${sku}`);
        const product = response.data.data;
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const productData = {
            sku: product.sku,
            name: product.productTitle,
            price: product.sellPrice,
            originalPrice: product.originalPrice,
            supplierCost: product.cost,
            image: product.mainImage,
            gallery: JSON.stringify(product.images || []),
            description: product.description,
            category: product.categoryName,
            inStock: product.stock ? 1 : 0,
            pid: product.pid,
            vid: product.vid,
            provider: 'CJ',
            supplierLink: product.sourceUrl
        };
        
        db.run('INSERT OR REPLACE INTO products (sku, name, price, originalPrice, supplierCost, image, gallery, description, category, inStock, pid, vid, provider, supplierLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
            Object.values(productData), 
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to import product' });
                }
                res.json({ message: 'Product imported successfully', product: productData });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Failed to import from CJ' });
    }
});

// AliExpress scraper
app.post('/api/scrape-aliexpress', authenticateAdmin, async (req, res) => {
    const { url } = req.body;
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const title = $('h1[data-product-title]').text().trim();
        const price = $('.product-price-text').text().trim();
        const images = [];
        
        $('.image-view-item img').each((i, elem) => {
            images.push($(elem).attr('src'));
        });
        
        res.json({
            title,
            price,
            images: images.slice(0, 5)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to scrape AliExpress' });
    }
});

// Admin API Endpoints
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
    console.log('GET /api/admin/users - Admin:', req.user);
    db.all(`SELECT id, name, email, plain_password, phone, address, city, zip, created_at FROM users ORDER BY created_at DESC`, (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ error: 'Failed to get users' });
        }
        console.log(`Found ${rows ? rows.length : 0} users`);
        res.json(rows || []);
    });
});

app.put('/api/admin/user-password/:id', authenticateAdmin, (req, res) => {
    const { plain_password } = req.body;
    if (!plain_password) {
        return res.status(400).json({ error: 'סיסמה חסרה' });
    }
    
    bcrypt.hash(plain_password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to hash password' });
        }
        
        db.run(`UPDATE users SET plain_password = ?, password = ? WHERE id = ?`, [plain_password, hashedPassword, req.params.id], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        });
    });
});

app.get('/api/admin/user-orders/:email', authenticateAdmin, (req, res) => {
    db.all(`SELECT id, productName, status, trackingNumber, cj_order_id, created_at FROM orders WHERE customer_email = ? ORDER BY id DESC`, 
        [req.params.email], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get user orders' });
        }
        res.json(rows || []);
    });
});

app.put('/api/products/:id', authenticateAdmin, upload.single('image'), (req, res) => {
    const { sku, name, description, price, originalPrice, supplierCost, image, gallery, category, provider, pid, vid, inStock } = req.body;
    const finalImage = req.file ? req.file.filename : (image || null);
    const query = `UPDATE products SET sku=?, name=?, description=?, price=?, originalPrice=?, supplierCost=?, image=?, gallery=?, category=?, provider=?, pid=?, vid=?, inStock=? WHERE id=?`;
    
    db.run(query, [sku, name, description, price, originalPrice, supplierCost, finalImage, JSON.stringify(gallery || []), category, provider, pid, vid, inStock, req.params.id], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to update product' });
        }
        res.json({ success: true });
    });
});

// Get user orders
app.get('/api/user/orders', authenticateToken, (req, res) => {
    db.all('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC', [req.user.email], (err, orders) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get orders' });
        }
        res.json(orders);
    });
});

// Update user password
app.put('/api/admin/user-password/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to hash password' });
        }
        
        db.run('UPDATE users SET password = ?, plain_password = ? WHERE id = ?', 
            [hashedPassword, password, id], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update password' });
            }
            res.json({ message: 'Password updated successfully' });
        });
    });
});

// Cart routes for logged in users
app.get('/api/user/cart', authenticateToken, (req, res) => {
    db.get('SELECT cart_json FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get cart' });
        }
        const cart = user && user.cart_json ? JSON.parse(user.cart_json) : [];
        res.json({ cart });
    });
});

app.post('/api/user/cart', authenticateToken, (req, res) => {
    const { cart } = req.body;
    
    db.run('UPDATE users SET cart_json = ? WHERE id = ?', [JSON.stringify(cart), req.user.id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update cart' });
        }
        res.json({ message: 'Cart updated successfully' });
    });
});

// User orders
app.get('/api/user/orders', authenticateToken, (req, res) => {
    db.all('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC', [req.user.email], (err, orders) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get orders' });
        }
        res.json(orders);
    });
});

// Checkout endpoint
app.post('/api/checkout', authenticateToken, (req, res) => {
    const { cart, paymentId } = req.body;
    
    if (!cart || !cart.length) {
        return res.status(400).json({ error: 'Cart is empty' });
    }
    
    const items_json = JSON.stringify(cart);
    const product_name = cart.map(item => item.name).join(', ');
    const revenue = cart.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
    const cost = cart.reduce((sum, item) => sum + parseFloat(item.supplierCost || 0), 0);
    const profit = revenue - cost;
    
    db.run('INSERT INTO orders (product_name, items_json, revenue, cost, profit, customer_name, customer_email, shipping_address, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [product_name, items_json, revenue, cost, profit, req.user.name, req.user.email, req.user.address || 'N/A', paymentId], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create order' });
            }
            res.json({ id: this.lastID, message: 'Order created successfully' });
        }
    );
});

// Auto-sync cron job (every hour)
cron.schedule('0 * * * *', async () => {
    console.log('Running automatic sync...');
    
    // Sync CJ products
    try {
        const products = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM products WHERE provider = "CJ"', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        for (const product of products) {
            try {
                const response = await axios.get(`https://api.cjdropshipping.com/product/api/product/query?apiKey=${CJ_API_KEY}&sku=${product.sku}`);
                const cjProduct = response.data.data;
                
                if (cjProduct) {
                    db.run('UPDATE products SET price = ?, originalPrice = ?, inStock = ? WHERE id = ?', 
                        [cjProduct.sellPrice, cjProduct.originalPrice, cjProduct.stock ? 1 : 0, product.id]);
                }
            } catch (error) {
                console.error(`Failed to sync CJ product ${product.sku}:`, error.message);
            }
        }
        
        console.log('CJ sync completed');
    } catch (error) {
        console.error('CJ sync failed:', error.message);
    }
});

// Serve main pages
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Automatic CJ Sync - סנכרון אוטומטי של מוצרים מ-CJ
const CJ_API_KEY = process.env.CJ_API_KEY || 'CJ5295285@api@e27a42bec7174b39b21e18c5f610e136';
const CJ_API_BASE = 'https://api.cjdropshipping.com';

// פונקציה לסנכרון אוטומטי
async function syncCJProducts() {
    console.log('🔄 Starting CJ Products Sync...');
    
    try {
        // קבלת טוקן גישה תחילה
        const token = await cjApi.getCjToken();
        if (!token) {
            throw new Error('Failed to get CJ access token');
        }
        
        console.log('🔑 Got CJ token, fetching products...');
        
        // קבלת רשימת מוצרים מ-CJ - משתמש בטוקן
        const response = await axios.get(`${CJ_API_BASE}/product/list`, {
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            params: {
                pageSize: 100,
                pageNum: 1
            },
            timeout: 15000
        });

        const products = response.data.data || [];
        console.log(`📦 Found ${products.length} products from CJ`);

        // עדכון כל מוצר במסד הנתונים
        for (const product of products) {
            await updateOrCreateProduct(product);
        }

        console.log('✅ CJ Products Sync completed successfully');
        return { success: true, updated: products.length };
        
    } catch (error) {
        console.error('❌ CJ Sync Error:', error.message);
        return { success: false, error: error.message };
    }
}

// פונקציה לעדכון או יצירת מוצר
async function updateOrCreateProduct(cjProduct) {
    return new Promise((resolve, reject) => {
        // בדיקה אם המוצר כבר קיים
        db.get('SELECT id FROM products WHERE sku = ?', [cjProduct.sku], (err, row) => {
            if (err) {
                console.error('Database error checking product:', err);
                return reject(err);
            }

            const productData = {
                sku: cjProduct.sku,
                name: cjProduct.productTitle || cjProduct.productName || 'מוצר ללא שם',
                price: parseFloat(cjProduct.sellPrice) || 0,
                originalPrice: parseFloat(cjProduct.originalPrice) || 0,
                supplierCost: parseFloat(cjProduct.cost) || 0,
                image: cjProduct.mainImageUrl || '',
                gallery: JSON.stringify(cjProduct.images || []),
                description: cjProduct.description || '',
                category: mapCJCategoryToHebrew(cjProduct.categoryName) || 'אחר',
                inStock: (cjProduct.stock > 0) ? 1 : 0,
                pid: cjProduct.pid || '',
                vid: cjProduct.vid || '',
                provider: 'CJ Dropshipping',
                supplierLink: cjProduct.productUrl || ''
            };

            if (row) {
                // עדכון מוצר קיים
                const query = `UPDATE products SET 
                    sku=?, name=?, price=?, originalPrice=?, supplierCost=?, 
                    image=?, gallery=?, description=?, category=?, inStock=?,
                    pid=?, vid=?, provider=?, supplierLink=?
                    WHERE id=?`;
                
                db.run(query, [
                    productData.sku, productData.name, productData.price, 
                    productData.originalPrice, productData.supplierCost,
                    productData.image, productData.gallery, productData.description, 
                    productData.category, productData.inStock,
                    productData.pid, productData.vid, productData.provider, 
                    productData.supplierLink, row.id
                ], (err) => {
                    if (err) {
                        console.error('Error updating product:', err);
                        return reject(err);
                    }
                    console.log(`📝 Updated product: ${productData.name}`);
                    resolve();
                });
            } else {
                // יצירת מוצר חדש
                const query = `INSERT INTO products (
                    sku, name, price, originalPrice, supplierCost, 
                    image, gallery, description, category, inStock,
                    pid, vid, provider, supplierLink
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                
                db.run(query, [
                    productData.sku, productData.name, productData.price, 
                    productData.originalPrice, productData.supplierCost,
                    productData.image, productData.gallery, productData.description, 
                    productData.category, productData.inStock,
                    productData.pid, productData.vid, productData.provider, 
                    productData.supplierLink
                ], function(err) {
                    if (err) {
                        console.error('Error creating product:', err);
                        return reject(err);
                    }
                    console.log(`➕ Created new product: ${productData.name}`);
                    resolve();
                });
            }
        });
    });
}

// מיפוי קטגוריות מ-CJ לעברית
function mapCJCategoryToHebrew(cjCategory) {
    const categoryMap = {
        'Gaming Mouse': 'עכברי גיימינג',
        'Gaming Keyboard': 'מקלדות גיימינג',
        'Gaming Headset': 'אוזניות גיימינג',
        'Gaming Chair': 'כיסאות גיימינג',
        'Gaming Monitor': 'צגמים גיימינג',
        'Gaming Accessories': 'מיקרופונים',
        'Computer Components': 'רכיבים מחשב',
        'Network Equipment': 'ציוד רשת'
    };
    
    return categoryMap[cjCategory] || 'אחר';
}

// הפעלת הסנכרון האוטומטי כל 30 דקות
setInterval(async () => {
    console.log('⏰ Starting scheduled CJ sync...');
    const result = await syncCJProducts();
    
    if (result.success) {
        console.log(`🎉 Sync completed: ${result.updated} products processed`);
    } else {
        console.log(`❌ Sync failed: ${result.error}`);
    }
}, 30 * 60 * 1000); // כל 30 דקות

// סנכרון ידני בהתחלת השרת
setTimeout(async () => {
    console.log('🚀 Starting initial CJ sync...');
    await syncCJProducts();
}, 5000); // אחרי 5 שניות

// CJ Orders API Service - שירות להזמנות ומעקב מ-CJ
class CJApiService {
    constructor() {
        this.apiKey = process.env.CJ_API_KEY || 'CJ5295285@api@e27a42bec7174b39b21e18c5f610e136';
        this.baseUrl = 'https://api.cjdropshipping.com';
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    // קבלת טוקן גישה ל-CJ API
    async getCjToken() {
        try {
            // אם יש טוקן בתוקף, השתמש בו
            if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                console.log('✅ Using existing CJ token');
                return this.accessToken;
            }

            console.log('🔑 Requesting new CJ access token...');
            
            const response = await axios.post(`${this.baseUrl}/auth/token`, {
                apiKey: this.apiKey
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log('📡 CJ auth response:', JSON.stringify(response.data, null, 2));

            // CJ API returns data in different formats
            if (response.data) {
                if (response.data.accessToken) {
                    this.accessToken = response.data.accessToken;
                } else if (response.data.data && response.data.data.accessToken) {
                    this.accessToken = response.data.data.accessToken;
                } else if (response.data.token) {
                    this.accessToken = response.data.token;
                }
                
                if (this.accessToken) {
                    // טוקן בתוקף ל-24 שעות
                    this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);
                    console.log('✅ CJ token obtained successfully');
                    return this.accessToken;
                }
            }
            
            throw new Error('Invalid token response from CJ: ' + JSON.stringify(response.data));
        } catch (error) {
            console.error('❌ Failed to get CJ token:', error.message);
            // אם האימות נכשל, ננסה להשתמש ב-API Key ישירות
            console.log('⚠️ Will use API Key directly for requests');
            return this.apiKey;
        }
    }

    // קבלת רשימת הזמנות מ-CJ
    async getCJOrders(page = 1, pageSize = 50) {
        const token = await this.getCjToken();
        if (!token) {
            console.error('Cannot fetch orders - no valid token');
            return null;
        }

        try {
            const response = await axios.get(`${this.baseUrl}/order/v1/list`, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                params: {
                    page: page,
                    pageSize: pageSize,
                    orderStatus: 'all' // כל הסטטוסים כדי לקבל גם הזמנות במשלוח
                },
                timeout: 15000
            });

            if (response.data && response.data.data && response.data.data.list) {
                console.log(`📦 Retrieved ${response.data.data.list.length} orders from CJ`);
                return response.data.data.list;
            }
            return [];
        } catch (error) {
            console.error('❌ Failed to fetch CJ orders:', error.message);
            return null;
        }
    }

    // קבלת פרטי הזמנה ספציפית כולל מספר מעקב
    async getCJOrderDetails(orderId) {
        const token = await this.getCjToken();
        if (!token) return null;

        try {
            const response = await axios.get(`${this.baseUrl}/order/v1/detail`, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                params: {
                    orderId: orderId
                },
                timeout: 10000
            });

            if (response.data && response.data.data) {
                return response.data.data;
            }
            return null;
        } catch (error) {
            console.error(`❌ Failed to fetch order ${orderId} details:`, error.message);
            return null;
        }
    }

    // סנכרון אוטומטי של מספרי מעקב מהזמנות CJ
    async syncCJTrackingNumbers() {
        console.log('🔄 Starting CJ Tracking Numbers Sync...');
        
        try {
            // קבלת הזמנות מ-CJ
            const cjOrders = await this.getCJOrders(1, 100);
            if (!cjOrders || cjOrders.length === 0) {
                console.log('No orders found from CJ');
                return { updated: 0, errors: 0 };
            }

            let updated = 0;
            let errors = 0;

            for (const cjOrder of cjOrders) {
                try {
                    // בדיקה אם יש מספר מעקב בהזמנת CJ
                    const trackingNumber = cjOrder.trackingNumber || 
                                          cjOrder.logisticNo || 
                                          (cjOrder.logistics && cjOrder.logistics.trackingNumber);
                    
                    if (!trackingNumber) {
                        continue; // אין מספר מעקב, דלג להזמנה הבאה
                    }

                    const cjOrderId = cjOrder.orderId || cjOrder.id;
                    const carrier = cjOrder.logisticName || 
                                   (cjOrder.logistics && cjOrder.logistics.carrierName) || 
                                   'israel_post';

                    // חפש הזמנה מקומית מתאימה
                    const localOrder = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT * FROM orders WHERE cj_order_id = ? OR payment_id LIKE ? ORDER BY created_at DESC LIMIT 1',
                            [cjOrderId, `%${cjOrderId}%`],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                    if (localOrder && !localOrder.trackingNumber) {
                        // עדכן את ההזמנה המקומית עם מספר המעקב
                        await new Promise((resolve, reject) => {
                            db.run(
                                `UPDATE orders SET 
                                    trackingNumber = ?, 
                                    carrier = ?, 
                                    tracking_status = 'pending',
                                    last_tracking_check = ?,
                                    cj_order_id = ?
                                 WHERE id = ?`,
                                [
                                    trackingNumber, 
                                    carrier.toLowerCase().includes('israel') ? 'israel_post' : 'other',
                                    new Date().toISOString(),
                                    cjOrderId,
                                    localOrder.id
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });

                        console.log(`✅ Updated order #${localOrder.id} with tracking: ${trackingNumber}`);
                        updated++;

                        // בצע בדיקת מעקב ראשונית מיד
                        try {
                            const trackingData = await TrackingService.trackOrder({
                                trackingNumber: trackingNumber,
                                carrier: carrier.toLowerCase().includes('israel') ? 'israel_post' : 'other'
                            });

                            if (trackingData && trackingData.status !== 'error') {
                                await new Promise((resolve, reject) => {
                                    db.run(
                                        'UPDATE orders SET tracking_status = ?, tracking_details = ? WHERE id = ?',
                                        [trackingData.status, JSON.stringify(trackingData), localOrder.id],
                                        (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        }
                                    );
                                });
                            }
                        } catch (trackErr) {
                            console.log(`Initial tracking check failed for order ${localOrder.id}:`, trackErr.message);
                        }
                    }
                } catch (orderErr) {
                    console.error(`Error processing CJ order:`, orderErr.message);
                    errors++;
                }
            }

            console.log(`🎉 CJ Tracking Sync Complete: ${updated} updated, ${errors} errors`);
            return { updated, errors };

        } catch (error) {
            console.error('❌ CJ Tracking Sync failed:', error.message);
            return { updated: 0, errors: 1, error: error.message };
        }
    }
}

// Initialize CJ API Service
const cjApi = new CJApiService();

// Cron job for automatic CJ tracking sync (every 2 hours)
cron.schedule('0 */2 * * *', async () => {
    console.log('⏰ Running scheduled CJ tracking sync...');
    try {
        const result = await cjApi.syncCJTrackingNumbers();
        console.log('✅ Scheduled sync result:', result);
    } catch (error) {
        console.error('❌ Scheduled CJ sync error:', error.message);
    }
});

// API endpoint to manually trigger CJ tracking sync
app.post('/api/admin/cj-sync-tracking', authenticateAdmin, async (req, res) => {
    try {
        console.log('🔄 Manual CJ tracking sync triggered by admin');
        const result = await cjApi.syncCJTrackingNumbers();
        res.json({
            success: true,
            message: `Synced ${result.updated} orders with tracking numbers`,
            result
        });
    } catch (error) {
        console.error('Manual CJ sync error:', error);
        res.status(500).json({ error: 'Sync failed', details: error.message });
    }
});

// API endpoint to test CJ connection
app.get('/api/admin/cj-test', authenticateAdmin, async (req, res) => {
    try {
        const token = await cjApi.getCjToken();
        if (token) {
            const orders = await cjApi.getCJOrders(1, 1);
            res.json({
                success: true,
                message: 'CJ API connection successful',
                hasOrders: orders && orders.length > 0,
                orderCount: orders ? orders.length : 0
            });
        } else {
            res.status(401).json({ error: 'Failed to authenticate with CJ API' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Test failed', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ VEXO Gaming Store running on http://localhost:${PORT}`);
    console.log(`📦 CJ API Integration: Active`);
    console.log(`🔄 Auto-sync: Every 2 hours`);
});
