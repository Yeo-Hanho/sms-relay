const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

const client = mqtt.connect('mqtt://broker.hivemq.com');
const topic = 'type1sc/test/pub';

let chunkBuffer = [];

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
  const payload = message.toString().trim();

  // [1] 회신 메시지는 무시
  if (payload.startsWith('relay_response=')) return;

  console.log('📨 수신된 메시지:', payload);

  const parsed = querystring.parse(payload);

  // [12] 아두이노 조각 메시지 수신 처리
  if (parsed.chunk && parsed.data) {
    const chunkIndex = parseInt(parsed.chunk);
    if (!chunkBuffer[chunkIndex - 1]) {
      chunkBuffer[chunkIndex - 1] = parsed.data;
    }

    console.log(`📦 조각 수신: #${chunkIndex}`);

    const allChunksReceived = chunkBuffer.length >= 3 && chunkBuffer.every(Boolean);
    if (allChunksReceived) {
      const fullMessage = chunkBuffer.join('');
      console.log('📦 전체 조립 메시지:', fullMessage);

      // [10] messageme에 보낼 때 api_key 앞부분 제거
      const idx = fullMessage.indexOf('api_key=');
      const messageBody = idx >= 0 ? fullMessage.substring(idx) : fullMessage;

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
        responseText = JSON.stringify({ result: '1100' }); // [4] 실패 시 1100 응답
      }

      // [5][23] messageme 응답을 아두이노로 전달
      client.publish(topic, `relay_response=${responseText}`);

      // [2][6] 조각 관련 변수 초기화 (전송 후 삭제)
      chunkBuffer = [];

      // [9] 전송 후 항상 대기 상태로 전환
      console.log('🕓 대기 중...');
    }
  }

  // [11] MQTT Explorer에서 단일 메시지 수신 처리
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

    client.publish(topic, `relay_response=${responseText}`);
    console.log('🕓 대기 중...');
  }
});

app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});






