const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

const client = mqtt.connect('mqtt://broker.hivemq.com');
const topic = 'type1sc/test/pub';

// [1] 메시지 조각 저장용 버퍼
let chunkBuffer = [];

// [2] MQTT 연결 완료 및 토픽 구독
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

// [3] MQTT 메시지 수신 처리
client.on('message', async (topic, message) => {
  const payload = message.toString().trim();

  // [4] 회신 메시지는 무시
  if (payload.startsWith('relay_response=')) return;

  console.log('📨 수신된 메시지:', payload);

  const parsed = querystring.parse(payload);

  // [5] 조각 메시지 수신
  if (parsed.chunk && parsed.data !== undefined) {
    const chunkIndex = parsed.chunk;

    if (chunkIndex !== 'EOF') {
      const index = parseInt(chunkIndex);
      chunkBuffer[index - 1] = parsed.data;
      console.log(`📦 조각 수신: #${index}`);
    }

    // [6] 전송 종료 신호 수신 시 처리
    if (chunkIndex === 'EOF') {
      const fullMessage = chunkBuffer.join('');
      chunkBuffer = []; // 초기화

      // [7] messageme에 보낼 때 api_key 앞부분 제거
      const idx = fullMessage.indexOf('api_key=');
      const messageBody = idx >= 0 ? fullMessage.substring(idx) : fullMessage;

      const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
      console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
      console.log('🚀 messageme로 전송할 데이터 본문:', messageBody);

      // [8] messageme 전송
      let responseText = '';
      try {
        const response = await axios.post(
          targetUrl,
          messageBody,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 3000,
          }
        );

        responseText = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
        console.log('✅ messageme 응답 수신 성공');
        console.log('📋 상태 코드:', response.status);
        console.log('📋 응답 내용:', responseText);
      } catch (error) {
        console.error('❌ messageme 전송 실패:', error.message);
        responseText = JSON.stringify({ result: '1100' });
      }

      // [9] messageme 응답을 그대로 아두이노로 전달
      client.publish(topic, responseText);

      // [10] 전송 후 대기 상태 진입
      console.log('🕓 대기 중...');
    }
  }

  // [11] MQTT Explorer에서 직접 전송한 메시지 처리
  else if (payload.includes('api_key=')) {
    const idx = payload.indexOf('api_key=');
    const messageBody = idx >= 0 ? payload.substring(idx) : payload;

    const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
    console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
    console.log('🚀 messageme로 전송할 데이터 본문:', messageBody);

    let responseText = '';
    try {
      const response = await axios.post(
        targetUrl,
        messageBody,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 3000,
        }
      );

      responseText = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
      console.log('✅ messageme 응답 수신 성공');
      console.log('📋 상태 코드:', response.status);
      console.log('📋 응답 내용:', responseText);
    } catch (error) {
      console.error('❌ messageme 전송 실패:', error.message);
      responseText = JSON.stringify({ result: '1100' });
    }

    // [12] 응답 전달
    client.publish(topic, responseText);
    console.log('🕓 대기 중...');
  }
});

// [13] HTTP 서버 시작
app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});







