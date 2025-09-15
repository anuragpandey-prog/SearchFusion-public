const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Check for environment variables at startup
if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY || !process.env.AZURE_OPENAI_DEPLOYMENT_NAME) {
    console.error("Azure OpenAI environment variables are not set. Please create a .env file.");
    process.exit(1);
}

const apiRoutes = require('./api'); // This is now safe to require

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        throw error;
    }

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(`Port ${PORT} requires elevated privileges`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`Port ${PORT} is already in use. Please free up the port or use a different one.`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});