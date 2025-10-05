import express from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import * as ort from 'onnxruntime-web';

const router = express.Router();

// 🔹 Cache for recent queries (1 minute)
const cache = new NodeCache({ stdTTL: 60 });

// 🔹 Dynamic history (last 30 days)
const historyCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 60 * 60 });

// 🔹 Load ONNX model
let session;
(async () => {
  session = await ort.InferenceSession.create('./model/rf_model.onnx');
  console.log('✅ ONNX model loaded successfully');
  console.log('Output names:', session.outputNames); // Check the real output name
})();

// 🔹 Prepare input for ONNX
function prepareInput(pm10, pm25, no2, so2, co, ozone) {
  const inputData = new Float32Array([pm10, pm25, no2, so2, co, ozone]);
  return { float_input: new ort.Tensor('float32', inputData, [1, 6]) }; // 'float_input' matches your model
}

// 🔹 Helper alert
function getAlert(aqi) {
  if (aqi <= 50) return "Good air quality, enjoy your day!";
  if (aqi <= 100) return "Moderate air quality, sensitive groups should reduce outdoor exertion.";
  if (aqi <= 150) return "Poor quality, avoid prolonged efforts outdoors.";
  if (aqi <= 200) return "Very poor quality, stay indoors";
  return "Dangerous air, protect yourself seriously";
}

// 🔹 Add to history
function saveToHistory(lat, lon, aqi, pm10, pm25, no2, so2, co, ozone) {
  const today = new Date().toISOString().split('T')[0];
  const key = `${lat}:${lon}`;
  let history = historyCache.get(key) || [];
  history.push({ date: today, aqi, pm10, pm25, no2, so2, co, ozone });
  if (history.length > 30) history = history.slice(history.length - 30);
  historyCache.set(key, history);
}

// 🔹 Endpoint prediction
router.post('/', async (req, res) => {
  const { lat, lon } = req.body;
  if (!lat || !lon) return res.status(400).json({ error: 'lat & lon required' });

  const key = `p:${lat}:${lon}`;
  const cached = cache.get(key);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    // 1️⃣ Air quality data (OpenAQ)
    const groundResp = await axios.get(`https://api.openaq.org/v2/latest?coordinates=${lat},${lon}&radius=5000`).catch(() => null);
    const ground = groundResp?.data ?? null;

    const pm10 = ground?.results?.[0]?.measurements?.find(m => m.parameter === 'pm10')?.value ?? 10;
    const pm25 = ground?.results?.[0]?.measurements?.find(m => m.parameter === 'pm25')?.value ?? 10;
    const no2 = ground?.results?.[0]?.measurements?.find(m => m.parameter === 'no2')?.value ?? 5;
    const so2 = ground?.results?.[0]?.measurements?.find(m => m.parameter === 'so2')?.value ?? 5;
    const co = ground?.results?.[0]?.measurements?.find(m => m.parameter === 'co')?.value ?? 0.2;
    const ozone = ground?.results?.[0]?.measurements?.find(m => m.parameter === 'o3')?.value ?? 10;

    // 🔹 Weather data (open-meteo)
    const weatherResp = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,humidity_2m,wind_speed_10m`).catch(() => null);
    const weather = weatherResp?.data ?? { temp: 20, humidity: 60, wind_speed: 3 };

    // 🔹 ONNX Prediction
    if (!session) return res.status(500).json({ error: 'Model not loaded' });
    const inputTensor = prepareInput(pm10, pm25, no2, so2, co, ozone);
    const output = await session.run(inputTensor);

    // Use actual output name
    const outputName = session.outputNames[0];
    const aqi_pred = output[outputName].data[0];

    // 🔹 Construct response
    const response = {
      location: { lat, lon },
      ts: new Date().toISOString(),
      aqi: aqi_pred,
      alert: getAlert(aqi_pred),
      pm10, pm25, no2, so2, co, ozone,
      sources: [
        { name: 'OpenAQ', ok: !!ground },
        { name: 'Weather', ok: !!weather }
      ]
    };

    // 🔹 Save cache & history
    cache.set(key, response);
    saveToHistory(lat, lon, aqi_pred, pm10, pm25, no2, so2, co, ozone);

    return res.json(response);

  } catch (err) {
    console.error('Prediction error:', err);
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// 🔹 Endpoint for history
router.get('/history', (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat/lon required' });
  const key = `${lat}:${lon}`;
  const history = historyCache.get(key) || [];
  res.json(history);
});

export default router;
