import express from 'express';
import axios from 'axios';
const router = express.Router();

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat/lon required' });

  try {
    const r = await axios.post(`${process.env.BASE_URL || 'http://localhost:3000/api/predict'}`, { lat, lon });
    const aqi = r.data.aqi;

    if (aqi > 150) return res.json({ alert: true, level: 'Unhealthy', message: 'Avoid outdoor activity' });
    if (aqi > 100) return res.json({ alert: true, level: 'Moderate', message: 'Consider reducing outdoor exercise' });

    return res.json({ alert: false });
  } catch (e) {
    return res.status(500).json({ error: 'alert_fail' });
  }
});

export default router;
