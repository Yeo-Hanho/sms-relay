const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');
const qs = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

const client = mqtt.connect('mqtt://broker.hivemq.com');
const topic = 'type1sc/test/pub';

let lastProcessedMessage = ''; // 최근 처리된 메시지 저장 (현재는 사용하지 않음)

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
  const rawPayload = message.toString();
  const cleanedPayload = rawPayload.trim(); // ✅ 1. 메시지 앞뒤 공백 제거

  // 회신 메시지는 무시
  if (cleanedPayload.startsWith('relay_response=')) return;

  // 항상 처리하고 삭제하므로 중복 체크는 사용하지 않음
  console.log('📨 수신된 메시지:', cleanedPayload);

  const parsed = qs.parse(cleanedPayload);
  const formattedPayload = qs.stringify(parsed);

  const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
  console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
  console.log('🚀 messageme로 전송할 데이터 본문:', formattedPayload);

  try {
    const response = await axios.post(
      targetUrl,
      formattedPayload,
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

    const responseString = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
    console.log('📤 아두이노로 전달할 응답:', responseString);
    client.publish(topic, `relay_response=${responseString}`);
  } catch (error) {
    console.error('❌ messageme 전송 실패:', error.message);
    if (error.response) {
      console.error('📋 오류 코드:', error.response.status);
      console.error('📋 오류 내용:', error.response.data);
      const failResponse = JSON.stringify({ result: '1100' });
      console.log('📤 아두이노로 전달할 실패 응답:', failResponse);
      client.publish(topic, 'relay_response=' + failResponse);
    } else {
      console.error('📋 messageme 응답 없음 또는 타임아웃');
      const timeoutResponse = JSON.stringify({ result: '2000' });
      console.log('📤 아두이노로 전달할 타임아웃 응답:', timeoutResponse);
      client.publish(topic, 'relay_response=' + timeoutResponse);
    }
  }

  console.log('🕓 대기 상태 진입 중...');
});

app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});







