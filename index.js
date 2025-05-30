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
let chunkBuffers = new Map();

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

  // [EOF 수신 시 메시지 조립]
  if (payload.includes('chunk=EOF') || payload.includes('msg_id=EOF')) {
    for (const [msgId, chunks] of chunkBuffers) {
      if (!chunks || chunks.length === 0) continue;
      console.log(`📦 전체 메시지 조립 완료:`);

      // [조립]
      let mergedParams = {};
      chunks.forEach(chunk => {
        const parts = chunk.split('=');
        const key = parts[0];
        const value = parts.slice(1).join('=');
        if (key.startsWith('msg_part')) {
          mergedParams.msg = (mergedParams.msg || '') + decodeURIComponent(value);
        } else if (key.startsWith('dstaddr_part')) {
          mergedParams.dstaddr = (mergedParams.dstaddr || '') + value;
        } else {
          mergedParams[key] = value;
        }
      });

      // [querystring.stringify로 전체 메시지 구성]
      const fullMessage = querystring.stringify(mergedParams);
      console.log("📋 조립 메시지 내용:", fullMessage);
      console.log("🔍 메시지 길이:", fullMessage.length);

      // [messageme API 호출]
      const targetUrl = 'http://www.messageme.co.kr/APIV2/API/sms_send';
      console.log(`🚀 messageme로 전송할 전체 URL: ${targetUrl}`);
      console.log('🚀 messageme로 전송할 데이터 본문:', fullMessage);

      let responseText = '';
      try {
        const response = await axios.post(
          targetUrl,
          fullMessage,
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
    }

    chunkBuffers.clear();
    return;
  }

  // [메시지 ID 및 chunk index 수신]
  const msgId = parsed.msg_id;
  const chunkData = payload;

  if (msgId) {
    if (!chunkBuffers.has(msgId)) chunkBuffers.set(msgId, []);
    chunkBuffers.get(msgId).push(chunkData);
    console.log(`📦 메시지 ID ${msgId} - chunk #${parsed.seq} 수신`);
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











