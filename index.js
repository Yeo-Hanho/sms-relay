// [모듈 로드 및 기본 설정 - 필요한 라이브러리 불러오기]
const mqtt = require('mqtt');
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

// [MQTT 브로커 연결 및 토픽 설정 - HiveMQ 공용 브로커에 연결]
const client = mqtt.connect('mqtt://broker.hivemq.com', {
  clientId: 'mqtt_server_' + Math.random().toString(16).substr(2, 8),
});
const topic = 'type1sc/test/pub';

// [메시지 조각 저장용 버퍼 - 조립 전까지 저장, 최대 100개로 초기화]
let chunkBuffer = new Array(100).fill(undefined);

// [MQTT 연결 성공 시 - 토픽 구독 시작]
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

// [MQTT 메시지 수신 처리 - 조각 또는 전체 메시지 구분하여 처리]
client.on('message', async (topic, message) => {
  const payload = message.toString().trim();

  // 🐞 [전체 수신 로그 출력]
  console.log('📨 수신된 메시지:', payload);

  // [회신 메시지는 무시 - 아두이노 응답 전용 키워드 필터링]
  if (payload.startsWith('relay_response=')) return;

  const parsed = querystring.parse(payload);

  // [조각 메시지인지 확인 및 처리]
  if (parsed.chunk && parsed.data !== undefined) {
    const chunkIndex = parsed.chunk;

    // [EOF 이전 - 인덱스 기반 배열 저장, 안전한 인덱스 처리]
    if (chunkIndex !== 'EOF') {
      const index = parseInt(chunkIndex);
      if (!isNaN(index) && index >= 1 && index <= 100) {
        chunkBuffer[index - 1] = parsed.data;
        console.log(`📦 조각 수신: #${index}`);
      } else {
        console.warn(`⚠️ 잘못된 조각 번호: ${chunkIndex}`);
      }
    }

    // [EOF 수신 시 전체 메시지 조립 시작]
    if (chunkIndex === 'EOF') {
      // 💡 조립 상태 디버깅
      console.log("🧩 조립 전 chunkBuffer 상태:");
      chunkBuffer.forEach((v, i) => {
        console.log(`chunk[${i + 1}] = ${v ? 'OK' : 'MISSING'}`);
      });

      if (chunkBuffer.length === 0 || chunkBuffer.includes(undefined)) {
        console.error('❌ 메시지 조각 누락 또는 순서 오류');
        chunkBuffer.forEach((v, i) => {
          if (v === undefined) console.warn(`⚠️ 누락된 조각: #${i + 1}`);
        });
        chunkBuffer = new Array(100).fill(undefined);
        return;
      }

      // [전체 메시지 조립]
      const fullMessage = chunkBuffer.join('');
      chunkBuffer = new Array(100).fill(undefined); // [조립 후 버퍼 초기화]

      console.log("📦 전체 메시지 조립 완료:", fullMessage);
      console.log("🔍 메시지 길이:", fullMessage.length);

      // [api_key 존재 여부 확인]
      if (!fullMessage.includes("api_key=")) {
        console.warn("⚠️ 조립된 메시지에 api_key 누락됨");
      }

      // [api_key 앞 부분 제외한 본문 추출]
      const idx = fullMessage.indexOf('api_key=');
      const messageBody = idx >= 0 ? fullMessage.substring(idx) : fullMessage;

      // [messageme API 호출 준비]
      const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
      console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
      console.log('🚀 messageme로 전송할 데이터 본문:', messageBody);

      let responseText = '';
      try {
        // [messageme에 POST 요청 전송]
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

        // [정상 응답 처리]
        responseText = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
        console.log('✅ messageme 응답 수신 성공');
        console.log('📋 상태 코드:', response.status);
        console.log('📋 응답 내용:', responseText);
      } catch (error) {
        // [예외 발생 시 기본 응답 전송]
        console.error('❌ messageme 전송 실패:', error.message);
        responseText = JSON.stringify({ result: '1100' });
      }

      // [응답을 MQTT로 아두이노에 전달]
      client.publish(topic, responseText);
      console.log('🕓 대기 중...');
    }
  }

  // [MQTT Explorer 등에서 단일 문자열 메시지 전송 시 처리]
  else if (payload.includes('api_key=')) {
    // [api_key 앞 부분 제외한 본문 추출]
    const idx = payload.indexOf('api_key=');
    const messageBody = idx >= 0 ? payload.substring(idx) : payload;

    const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
    console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
    console.log('🚀 messageme로 전송할 데이터 본문:', messageBody);

    let responseText = '';
    try {
      // [messageme에 POST 요청 전송]
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

      // [정상 응답 처리]
      responseText = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
      console.log('✅ messageme 응답 수신 성공');
      console.log('📋 상태 코드:', response.status);
      console.log('📋 응답 내용:', responseText);
    } catch (error) {
      // [예외 발생 시 기본 응답 전송]
      console.error('❌ messageme 전송 실패:', error.message);
      responseText = JSON.stringify({ result: '1100' });
    }

    // [응답을 MQTT로 아두이노에 전달]
    client.publish(topic, responseText);
    console.log('🕓 대기 중...');
  }
});

// [HTTP 서버 루트 엔드포인트 - 상태 확인용 페이지]
app.get('/', (req, res) => {
  res.send('✅ MQTT relay server is running.');
});

// [HTTP 서버 시작 - 지정 포트에서 수신 대기]
app.listen(PORT, () => {
  console.log(`🌐 HTTP 서버 포트: ${PORT}`);
});






