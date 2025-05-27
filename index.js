const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

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

// 메시지 수신 및 처리
client.on('message', async (topic, message) => {
  const payload = message.toString();
  console.log('📨 수신된 메시지:', payload);

  let attempt = 0;
  const maxAttempts = 3;

  const sendToMessageMe = async () => {
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

      client.publish(topic, `relay_response=${encodeURIComponent(response.data)}`);
    } catch (error) {
      attempt++;
      console.error(`❌ messageme 전송 실패 (시도 ${attempt}):`, error.message);
      if (attempt < maxAttempts) {
        setTimeout(sendToMessageMe, 2000); // 2초 후 재시도
      } else {
        client.publish(topic, 'relay_response=fail');
      }
    }
  };

  sendToMessageMe();
});

app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});
