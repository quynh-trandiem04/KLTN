// blockchain-adapter/src/app.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.send('Blockchain Adapter Service is Running!');
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`Node.js Adapter đang chạy tại: http://localhost:${PORT}`);
    console.log(`Ready to accept requests from Python/Frontend`);
    console.log(`==================================================\n`);
});