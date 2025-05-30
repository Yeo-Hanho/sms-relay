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
const chunkBuffers = new Map();

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

  if (payload.startsWith('relay_response=')) return;

  const parsed = querystring.parse(payload);

  // [조각 메시지 수신 시 처리 (msg_id 포함)]
  if (parsed.msg_id && parsed.seq && parsed.total && parsed.data !== undefined) {
    const msgId = parsed.msg_id;
    const seq = parseInt(parsed.seq);
    const total = parseInt(parsed.total);

    if (!chunkBuffers.has(msgId)) {
      chunkBuffers.set(msgId, {
        total: total,
        receivedChunks: {},
        receivedCount: 0,
        timer: setTimeout(() => {
          console.warn(`⏰ 메시지 ID ${msgId} 타임아웃 발생, 버퍼 삭제`);
          chunkBuffers.delete(msgId);
        }, 20000),  // ✅ timeout 20초로 연장
      });
    }

    const buffer = chunkBuffers.get(msgId);
    if (!buffer.receivedChunks[seq]) {
      buffer.receivedChunks[seq] = parsed.data;
      buffer.receivedCount++;
      console.log(`📦 메시지 ID ${msgId} - chunk #${seq} 수신`);
    }

    if (buffer.receivedCount === buffer.total) {
      clearTimeout(buffer.timer);

      const messageChunks = [];
      for (let i = 1; i <= buffer.total; i++) {
        if (!buffer.receivedChunks[i]) {
          console.error(`❌ 메시지 ID ${msgId} - 누락된 chunk #${i}`);
          chunkBuffers.delete(msgId);
          return;
        }
        messageChunks.push(buffer.receivedChunks[i]);
      }

      const fullMessage = messageChunks.join('&');
      console.log("📦 전체 메시지 조립 완료:");
      console.log("📋 조립 메시지 내용:", fullMessage);

      const idx = fullMessage.indexOf('api_key=');
      const messageBody = idx >= 0 ? fullMessage.substring(idx) : fullMessage;

      let rebuiltMessage = messageBody;
      const msgKeyIdx = messageBody.indexOf('msg=');
      if (msgKeyIdx >= 0) {
        const msgStart = msgKeyIdx + 4;
        const msgEndIdx = messageBody.indexOf('&', msgStart);
        const msgEnd = msgEndIdx !== -1 ? msgEndIdx : messageBody.length;
        const msgValue = messageBody.substring(msgStart, msgEnd);
        const encodedMsgValue = encodeURIComponent(msgValue);
        rebuiltMessage = messageBody.substring(0, msgStart) + encodedMsgValue + messageBody.substring(msgEnd);
      }

      const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
      console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
      console.log('🚀 messageme로 전송할 데이터 본문:', rebuiltMessage);

      let responseText = '';
      try {
        const response = await axios.post(
          targetUrl,
          rebuiltMessage,
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

      client.publish(topic, `relay_response=${responseText}`);
      console.log('📤 MQTT 회신 메시지 전송 완료');
      chunkBuffers.delete(msgId);
    }
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









