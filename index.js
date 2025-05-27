const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// HiveMQ 브로커에 연결
const client = mqtt.connect('mqtt://broker.hivemq.com');
const topic = 'type1sc/test/pub';

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
  const payload = message.toString();
  console.log('📨 수신된 메시지:', payload);

  // messageme로 HTTP POST 전송
  try {
    const response = await axios.post(
      'http://www.messageme.co.kr/APIV2/API/sms_send',
      payload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 8000,
      }
    );

    console.log('✅ messageme 응답:', response.data);

    // 응답을 다시 MQTT로 발행
    client.publish(topic, `relay_response=${encodeURIComponent(response.data)}`);
  } catch (error) {
    console.error('❌ messageme 전송 실패:', error.message);
    client.publish(topic, 'relay_response=fail');
  }
});

// Render 상태 확인용 라우트
app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});