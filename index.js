// [index.js 전체 코드 - 각 기능별 주석 상세히 추가]

// [모듈 및 라이브러리 불러오기]
const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

// [Express 앱과 포트 설정]
const app = express();
const PORT = process.env.PORT || 10000;

// [MQTT 클라이언트 설정]
const client = mqtt.connect('mqtt://broker.hivemq.com', {
  clientId: 'mqtt_server_' + Math.random().toString(16).substr(2, 8),
});
const topic = 'type1sc/test/pub';

// [메시지 조각을 저장하는 버퍼]
let chunkBuffer = new Array(100).fill(undefined);

// [MQTT 연결 성공 시 토픽 구독]
client.on('connect', () => {
  console.log('✅ MQTT 연결 완료');
  client.subscribe(topic, (err, granted) => {
    if (err) {
      console.error('❌ MQTT 토픽 구독 실패:', err);
    } else {
      console.log(`📡 구독 토픽: ${topic}`);
      console.log(`📄 구독 상세:`, granted);
    }
  });
});

// [MQTT 메시지 수신 처리]
client.on('message', async (topic, message) => {
  const payload = message.toString().trim();
  console.log('📨 수신된 메시지:', payload);

  // [아두이노 응답 메시지 제외]
  if (payload.startsWith('relay_response=')) return;

  const parsed = querystring.parse(payload);

  // [조각 메시지 수신 시 처리]
  if (parsed.chunk && parsed.data !== undefined) {
    const chunkIndex = parsed.chunk;

    // [조각 메시지 저장]
    if (chunkIndex !== 'EOF') {
      const index = parseInt(chunkIndex);
      if (!isNaN(index) && index >= 1 && index <= 100) {
        chunkBuffer[index - 1] = parsed.data;
        console.log(`📦 조각 수신: #${index}`);
      } else {
        console.warn(`⚠️ 잘못된 조각 번호: ${chunkIndex}`);
      }
    }

    // [EOF 수신 시 메시지 조립]
    if (chunkIndex === 'EOF') {
      console.log("🧩 조립 전 chunkBuffer 상태:");
      let receivedChunks = 0;
      chunkBuffer.forEach((v, i) => {
        if (v !== undefined) {
          console.log(`chunk[${i + 1}] = OK`);
          receivedChunks++;
        } else {
          console.log(`chunk[${i + 1}] = MISSING`);
        }
      });

      if (receivedChunks === 0) {
        console.warn("⚠️ 유효한 조각이 전혀 없음. 조립 생략");
        return;
      }

      if (chunkBuffer.includes(undefined)) {
        console.error('❌ 메시지 조각 누락 또는 순서 오류');
        chunkBuffer.forEach((v, i) => {
          if (v === undefined) console.warn(`⚠️ 누락된 조각: #${i + 1}`);
        });
        chunkBuffer = new Array(100).fill(undefined);
        return;
      }

      // [전체 메시지 디코딩 및 출력]
      const encodedMessage = chunkBuffer.join('');
      const fullMessage = decodeURIComponent(encodedMessage);
      chunkBuffer = new Array(100).fill(undefined);

      console.log("📦 전체 메시지 조립 완료:");
      console.log("📋 조립 메시지 내용:", fullMessage);
      console.log("🔍 메시지 길이:", fullMessage.length);

      // [api_key 유효성 확인]
      if (!fullMessage.includes("api_key=")) {
        console.warn("⚠️ 조립된 메시지에 api_key 누락됨");
      }

      // [messageme 전송 준비]
      const idx = fullMessage.indexOf('api_key=');
      const messageBody = idx >= 0 ? fullMessage.substring(idx) : fullMessage;
      const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
      console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
      console.log('🚀 messageme로 전송할 데이터 본문:', messageBody);

      // [messageme API 호출]
      let responseText = '';
      try {
        const response = await axios.post(
          targetUrl,
          messageBody,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

      // [MQTT 응답 전송]
      client.publish(topic, `relay_response=${responseText}`);
      console.log('📤 MQTT 회신 메시지 전송 완료');
    }
  }

  // [Explorer 등에서 직접 메시지 수신 시 처리]
  else if (payload.includes('api_key=')) {
    const idx = payload.indexOf('api_key=');
    const messageBody = idx >= 0 ? payload.substring(idx) : payload;
    const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
    console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
    console.log('🚀 messageme로 전송할 데이터 본문:', messageBody);

    // [messageme API 호출]
    let responseText = '';
    try {
      const response = await axios.post(
        targetUrl,
        messageBody,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

    // [MQTT 응답 전송]
    client.publish(topic, `relay_response=${responseText}`);
    console.log('📤 MQTT 회신 메시지 전송 완료');
  }
});

// [HTTP 서버 라우팅]
app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

// [Express 서버 시작]
app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});





