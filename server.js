const express = require('express');
const path = require('path');
const http = require('http');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));
app.use(express.json());

// Root route - serve index.html
app.get('/', (req, res) => {
    console.log('Serving support form from root path (index.html)');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Support form route - explicitly serve support-form.html
app.get('/support-form.html', (req, res) => {
    console.log('Serving support form (support-form.html)');
    res.sendFile(path.join(__dirname, 'support-form.html'));
});

// Chat route with path parameter - serve chat.html
app.get('/chat/:requestId', (req, res) => {
    console.log(`Serving chat.html for request ID ${req.params.requestId} (path parameter style)`);
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// Chat route with query parameters - serve chat.html
app.get('/chat.html', (req, res) => {
    const requestId = req.query.request_id;
    const adminId = req.query.admin_id;
    
    // Log the request for debugging
    console.log(`Serving chat.html with query parameters - Request ID: ${requestId}, Admin ID: ${adminId}`);
    
    // Check if this is an admin request
    if (adminId) {
        console.log(`ADMIN MODE: Admin ${adminId} accessing chat for request ${requestId}`);
    } else {
        console.log(`USER MODE: User accessing chat for request ${requestId}`);
    }
    
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// Admin chat direct API proxy with retries and better error handling
app.get('/admin-chat-direct/:requestId/:adminId', async (req, res) => {
    const { requestId, adminId } = req.params;
    const apiHost = 'supportbot';
    const apiPort = 8000;
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} to proxy admin-chat-direct request`);
            
            const apiRes = await new Promise((resolve, reject) => {
                const options = {
                    hostname: apiHost,
                    port: apiPort,
                    path: `/admin-chat-direct/${requestId}/${adminId}`,
                    method: 'GET',
                    timeout: 5000 // 5 second timeout per attempt
                };

                const req = http.request(options, resolve);
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timed out'));
                });
                req.end();
            });

            let data = '';
            await new Promise((resolve, reject) => {
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => resolve());
                apiRes.on('error', reject);
            });

            if (apiRes.statusCode === 200) {
                console.log('Successfully proxied admin-chat-direct request');
                return res.json(JSON.parse(data));
            }

            lastError = new Error(`API returned status ${apiRes.statusCode}: ${data}`);
            console.error(`Attempt ${attempt} failed:`, lastError.message);

        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                // On final attempt, try fallback to regular chat endpoint
                try {
                    console.log('Trying fallback to regular chat endpoint...');
                    const fallbackRes = await new Promise((resolve, reject) => {
                        const options = {
                            hostname: apiHost,
                            port: apiPort,
                            path: `/api/chat/${requestId}`,
                            method: 'GET',
                            timeout: 5000
                        };

                        const req = http.request(options, resolve);
                        req.on('error', reject);
                        req.on('timeout', () => {
                            req.destroy();
                            reject(new Error('Fallback request timed out'));
                        });
                        req.end();
                    });

                    let fallbackData = '';
                    await new Promise((resolve, reject) => {
                        fallbackRes.on('data', chunk => fallbackData += chunk);
                        fallbackRes.on('end', () => resolve());
                        fallbackRes.on('error', reject);
                    });

                    if (fallbackRes.statusCode === 200) {
                        console.log('Successfully retrieved data from fallback endpoint');
                        const chatData = JSON.parse(fallbackData);
                        chatData.admin_id = adminId; // Add admin ID to the response
                        return res.json(chatData);
                    }
                } catch (fallbackError) {
                    console.error('Fallback attempt failed:', fallbackError.message);
                }
            }
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All attempts failed
    console.error('All attempts to proxy admin-chat-direct request failed');
    res.status(500).json({
        error: 'Failed to retrieve chat data',
        details: lastError ? lastError.message : 'Unknown error',
        requestId,
        adminId
    });
});

// Message polling endpoint with cursor-based pagination
app.get('/api/chat/:requestId/messages', async (req, res) => {
    const { requestId } = req.params;
    const { since, admin_id } = req.query;
    
    try {
        const apiHost = 'supportbot';
        const apiPort = 8000;
        
        const options = {
            hostname: apiHost,
            port: apiPort,
            path: `/api/chat/${requestId}/messages?since=${since}${admin_id ? `&admin_id=${admin_id}` : ''}`,
            method: 'GET',
            timeout: 30000 // 30 second timeout for long polling
        };

        const apiRes = await new Promise((resolve, reject) => {
            const req = http.request(options, resolve);
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });
            req.end();
        });

        let data = '';
        await new Promise((resolve, reject) => {
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => resolve());
            apiRes.on('error', reject);
        });

        if (apiRes.statusCode === 200) {
            res.json(JSON.parse(data));
        } else {
            throw new Error(`API returned status ${apiRes.statusCode}`);
        }
    } catch (error) {
        console.error('Error polling messages:', error);
        res.status(500).json({
            error: 'Failed to poll messages',
            details: error.message
        });
    }
});

// Send message endpoint
app.post('/api/chat/:requestId/messages', async (req, res) => {
    const { requestId } = req.params;
    const { message, sender_id, sender_type } = req.body;
    
    try {
        const apiHost = 'supportbot';
        const apiPort = 8000;
        
        const options = {
            hostname: apiHost,
            port: apiPort,
            path: `/api/chat/${requestId}/messages`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const apiRes = await new Promise((resolve, reject) => {
            const req = http.request(options, resolve);
            req.on('error', reject);
            req.write(JSON.stringify({ message, sender_id, sender_type }));
            req.end();
        });

        let data = '';
        await new Promise((resolve, reject) => {
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => resolve());
            apiRes.on('error', reject);
        });

        if (apiRes.statusCode === 200) {
            res.json(JSON.parse(data));
        } else {
            throw new Error(`API returned status ${apiRes.statusCode}`);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            error: 'Failed to send message',
            details: error.message
        });
    }
});

// Support request submission endpoint
app.post('/support-request', async (req, res) => {
    console.log('Received support request submission');
    
    try {
        const apiHost = 'supportbot';
        const apiPort = 8000;
        const requestBody = req.body;
        
        console.log('Request body:', requestBody);

        const options = {
            hostname: apiHost,
            port: apiPort,
            path: '/api/support/request', // Changed to use the working API endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout
        };

        console.log('Proxying support request to supportbot service API endpoint');
        
        const apiRes = await new Promise((resolve, reject) => {
            const proxyReq = http.request(options, resolve);
            proxyReq.on('error', reject);
            proxyReq.on('timeout', () => {
                proxyReq.destroy();
                reject(new Error('Request timed out'));
            });
            proxyReq.write(JSON.stringify(requestBody));
            proxyReq.end();
        });

        let data = '';
        await new Promise((resolve, reject) => {
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => resolve());
            apiRes.on('error', reject);
        });

        if (apiRes.statusCode === 200) {
            console.log('Support request submitted successfully');
            res.json(JSON.parse(data));
        } else {
            console.error(`Support request failed with status ${apiRes.statusCode}`);
            throw new Error(`API returned status ${apiRes.statusCode}: ${data}`);
        }
    } catch (error) {
        console.error('Error submitting support request:', error);
        res.status(500).json({
            error: 'Failed to submit support request',
            details: error.message
        });
    }
});

// API support request endpoint (for the updated form)
app.post('/api/support/request', async (req, res) => {
    console.log('Received API support request submission');
    
    try {
        const apiHost = 'supportbot';
        const apiPort = 8000;
        const requestBody = req.body;
        
        console.log('API request body:', requestBody);

        const options = {
            hostname: apiHost,
            port: apiPort,
            path: '/api/support/request', // Use the API path that works in the backend
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout
        };

        console.log('Sending support request to supportbot API endpoint');
        
        const apiRes = await new Promise((resolve, reject) => {
            const proxyReq = http.request(options, resolve);
            proxyReq.on('error', reject);
            proxyReq.on('timeout', () => {
                proxyReq.destroy();
                reject(new Error('Request timed out'));
            });
            proxyReq.write(JSON.stringify(requestBody));
            proxyReq.end();
        });

        let data = '';
        await new Promise((resolve, reject) => {
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => resolve());
            apiRes.on('error', reject);
        });

        if (apiRes.statusCode === 200) {
            console.log('API support request submitted successfully');
            res.json(JSON.parse(data));
        } else {
            console.error(`API support request failed with status ${apiRes.statusCode}`);
            throw new Error(`API returned status ${apiRes.statusCode}: ${data}`);
        }
    } catch (error) {
        console.error('Error submitting API support request:', error);
        res.status(500).json({
            error: 'Failed to submit support request',
            details: error.message
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Web app server running on port ${port}`);
}); 