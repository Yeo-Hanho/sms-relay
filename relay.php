<?php
$data = http_build_query($_POST);
$url = "http://www.messageme.co.kr/APIV2/API/sms_send";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Content-Type: application/x-www-form-urlencoded"
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

header("Content-Type: application/json");
echo json_encode([
  "relay" => "ok",
  "forwarded" => true,
  "status" => $http_code,
  "response" => $response
]);
?>