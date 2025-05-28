const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

const client = mqtt.connect('mqtt://broker.hivemq.com');
const topic = 'type1sc/test/pub';

let isProcessing = false;

client.on('connect', () => {
  console.log('✅ MQTT 연결 완료');
  client.subscribe(topic, (err) => {
    if (err) {
      console.error('❌ MQTT 토픽 구독 실패:', err);
    } else {
      console.log(`📡 구독 토픽: ${topic}`);
    }
  });
});

client.on('message', async (topic, message) => {
  if (isProcessing) return;
  isProcessing = true;

  const payload = message.toString();
  console.log('📨 수신된 메시지:', payload);

  const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
  console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
  console.log('🚀 messageme로 전송할 데이터 본문:', payload);

  let responsePayload;

  try {
    const response = await axios.post(
      targetUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 8000,
      }
    );

    console.log('✅ messageme 응답 수신 성공');
    console.log('📋 상태 코드:', response.status);
    console.log('📋 응답 내용:', response.data);

    responsePayload = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
  } catch (error) {
    console.error('❌ messageme 전송 실패:', error.message);
    if (error.response) {
      console.error('📋 오류 코드:', error.response.status);
      console.error('📋 오류 내용:', error.response.data);
      responsePayload = JSON.stringify({ result: '1000' });
    } else {
      console.error('📋 messageme 응답 없음 또는 타임아웃');
      responsePayload = JSON.stringify({ result: '2000' });
    }
  }

  console.log('📤 아두이노로 전달할 응답:', responsePayload);
  client.publish(topic, `relay_response=${responsePayload}`);

  isProcessing = false;
});

app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});



