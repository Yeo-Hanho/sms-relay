# 베이스 이미지
FROM node:18

# 작업 디렉토리 생성
WORKDIR /usr/src/app

# 패키지 정보 복사 및 종속성 설치
COPY package*.json ./
RUN npm install

# 소스 코드 복사
COPY . .

# HTTP 서버 포트
EXPOSE 3000

# 서버 실행
CMD ["npm", "start"]