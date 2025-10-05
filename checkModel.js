import * as ort from 'onnxruntime-web';

(async () => {
  const session = await ort.InferenceSession.create('./model/rf_model.onnx');
  console.log('Model Inputs:', session.inputNames);
})();
