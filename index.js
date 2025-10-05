import express from 'express';
import dotenv from 'dotenv';
import predictRouter from './api/predict.js';
import alertRouter from './api/alerts.js';

dotenv.config();

const app = express();
app.use(express.json());

// 🔹 routes
app.use('/api/predict', predictRouter);
app.use('/api/alerts', alertRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
