// ASCII-only, English comments only.
// Friendly Direction Warning node for XIAO ESP32-C3 + MPU6050.
// Sends telemetry to Python server over UDP and receives alert commands.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <math.h>

// ---------------- User config ----------------
static const char* WIFI_SSID = "YuvalAndAviv";
static const char* WIFI_PASSWORD = "Yuval123";

static const char* SERVER_IP = "192.168.10.7";
static const uint16_t SERVER_UDP_PORT = 19999;
static const uint16_t LOCAL_UDP_PORT = 12001;

static const uint8_t PLAYER_ID = 1;

// Board profile selection.
#define BOARD_PROFILE_XIAO_ESP32C3 1
#define BOARD_PROFILE_TTGO_T18_30 2

// Change this line if needed.
#define BOARD_PROFILE BOARD_PROFILE_XIAO_ESP32C3

#if BOARD_PROFILE == BOARD_PROFILE_XIAO_ESP32C3
// XIAO ESP32-C3 mapping: D4 -> GPIO6, D5 -> GPIO7
static const int PIN_SDA = 6;
static const int PIN_SCL = 7;
#ifndef LED_BUILTIN
#define LED_BUILTIN 21
#endif
static const int PIN_ALERT_OUTPUT = LED_BUILTIN;
#elif BOARD_PROFILE == BOARD_PROFILE_TTGO_T18_30
// TTGO T-Energy T18_3.0 typical ESP32 I2C pins.
// If your board wiring differs, update these two values.
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif
static const int PIN_ALERT_OUTPUT = LED_BUILTIN;
#else
#error "Unsupported BOARD_PROFILE"
#endif

// Optional recenter button. Set 0 when no button is connected.
#ifndef RECENTER_BUTTON_ENABLED
#define RECENTER_BUTTON_ENABLED 0
#endif

#ifndef PIN_RECENTER_BUTTON
#define PIN_RECENTER_BUTTON 1
#endif

static const uint32_t TELEMETRY_RATE_HZ = 20;
static const uint32_t GYRO_CALIBRATION_MS = 2000;
static const uint32_t AUTO_RECENTER_DELAY_MS = 1500;

// ---------------- Protocol constants ----------------
static const uint8_t FDW_MAGIC0 = 0x46; // 'F'
static const uint8_t FDW_MAGIC1 = 0x44; // 'D'
static const uint8_t FDW_VERSION = 0x01;
static const uint8_t FDW_MSG_TELEMETRY = 0x01;
static const uint8_t FDW_MSG_ALERT = 0x02;

static const size_t FDW_TELEMETRY_SIZE = 32;
static const size_t FDW_ALERT_SIZE = 11;

static const uint8_t FLAG_IMU_ONLY_MODE = (1u << 0);
static const uint8_t FLAG_AUTO_RECENTER_DONE = (1u << 1);

// ---------------- MPU6050 constants ----------------
static const uint8_t MPU_ADDR = 0x68;
static const uint8_t REG_SMPLRT_DIV = 0x19;
static const uint8_t REG_CONFIG = 0x1A;
static const uint8_t REG_GYRO_CFG = 0x1B;
static const uint8_t REG_ACCEL_CFG = 0x1C;
static const uint8_t REG_ACCEL_CFG2 = 0x1D;
static const uint8_t REG_ACCEL_XOUT = 0x3B;
static const uint8_t REG_PWR_MGMT_1 = 0x6B;
static const uint8_t REG_WHO_AM_I = 0x75;

// +/-2g and +/-250dps
static const float ACCEL_LSB_PER_G = 16384.0f;
static const float GYRO_LSB_PER_DPS = 131.0f;

static const float RAD_TO_DEG = 57.2957795f;

// Complementary filter
static const float ALPHA = 0.98f;

// ---------------- Runtime state ----------------
static WiFiUDP udp;

static bool g_mpu_ok = false;
static bool g_wifi_ok = false;

static float pitch_deg = 0.0f;
static float roll_deg = 0.0f;
static float yaw_deg = 0.0f;
static float yaw_offset = 0.0f;

static bool auto_recenter_done = false;
static uint32_t boot_ms = 0;

static float gyro_bias_x_dps = 0.0f;
static float gyro_bias_y_dps = 0.0f;
static float gyro_bias_z_dps = 0.0f;

static uint16_t seq = 0;
static uint32_t last_imu_ms = 0;
static uint32_t last_tx_ms = 0;

static bool alert_on = false;
static uint8_t alert_intensity = 0;
static uint32_t alert_hold_until_ms = 0;

#if RECENTER_BUTTON_ENABLED
static bool prev_button = false;
static uint32_t button_pressed_ms = 0;
#endif

// ---------------- Byte helpers ----------------
static inline void write_u16_le(uint8_t* p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
}

static inline void write_u32_le(uint8_t* p, uint32_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
  p[2] = (uint8_t)((v >> 16) & 0xFF);
  p[3] = (uint8_t)((v >> 24) & 0xFF);
}

static inline uint16_t read_u16_le(const uint8_t* p) {
  return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static uint16_t crc16_ccitt_false(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (int bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (uint16_t)((crc << 1) ^ 0x1021);
      } else {
        crc = (uint16_t)(crc << 1);
      }
    }
  }
  return crc;
}

static float wrap_deg(float a) {
  while (a > 180.0f) a -= 360.0f;
  while (a < -180.0f) a += 360.0f;
  return a;
}

static int16_t deg_to_cd(float deg) {
  int v = (int)lroundf(deg * 100.0f);
  if (v < -32768) v = -32768;
  if (v > 32767) v = 32767;
  return (int16_t)v;
}

static uint8_t clamp_u8_int(int v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return (uint8_t)v;
}

// ---------------- MPU helpers ----------------
static bool mpuWriteReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return (Wire.endTransmission() == 0);
}

static bool mpuReadRegs(uint8_t start_reg, uint8_t* buf, size_t len) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(start_reg);
  if (Wire.endTransmission(false) != 0) return false;
  size_t got = Wire.requestFrom((int)MPU_ADDR, (int)len);
  if (got != len) return false;
  for (size_t i = 0; i < len; i++) {
    buf[i] = (uint8_t)Wire.read();
  }
  return true;
}

static bool mpuInit() {
  uint8_t who = 0;
  if (!mpuReadRegs(REG_WHO_AM_I, &who, 1)) return false;
  if (who != 0x68) {
    Serial.printf("MPU6050 WHO_AM_I mismatch: 0x%02X\n", who);
    return false;
  }

  if (!mpuWriteReg(REG_PWR_MGMT_1, 0x01)) return false;
  delay(30);

  // 1 kHz / (1 + 4) = 200 Hz
  if (!mpuWriteReg(REG_SMPLRT_DIV, 0x04)) return false;
  if (!mpuWriteReg(REG_CONFIG, 0x03)) return false;
  if (!mpuWriteReg(REG_GYRO_CFG, 0x00)) return false;   // +/-250dps
  if (!mpuWriteReg(REG_ACCEL_CFG, 0x00)) return false;  // +/-2g
  if (!mpuWriteReg(REG_ACCEL_CFG2, 0x03)) return false;

  return true;
}

static bool readAccelGyroRaw(int16_t& ax, int16_t& ay, int16_t& az, int16_t& gx, int16_t& gy, int16_t& gz) {
  uint8_t buf[14];
  if (!mpuReadRegs(REG_ACCEL_XOUT, buf, sizeof(buf))) return false;

  ax = (int16_t)((buf[0] << 8) | buf[1]);
  ay = (int16_t)((buf[2] << 8) | buf[3]);
  az = (int16_t)((buf[4] << 8) | buf[5]);

  gx = (int16_t)((buf[8] << 8) | buf[9]);
  gy = (int16_t)((buf[10] << 8) | buf[11]);
  gz = (int16_t)((buf[12] << 8) | buf[13]);
  return true;
}

static bool calibrateGyroBias() {
  uint32_t samples = GYRO_CALIBRATION_MS / 10;
  if (samples < 10) samples = 10;

  double sx = 0.0;
  double sy = 0.0;
  double sz = 0.0;

  for (uint32_t i = 0; i < samples; i++) {
    int16_t ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
    if (!readAccelGyroRaw(ax, ay, az, gx, gy, gz)) return false;
    sx += (double)gx / GYRO_LSB_PER_DPS;
    sy += (double)gy / GYRO_LSB_PER_DPS;
    sz += (double)gz / GYRO_LSB_PER_DPS;
    delay(10);
  }

  gyro_bias_x_dps = (float)(sx / samples);
  gyro_bias_y_dps = (float)(sy / samples);
  gyro_bias_z_dps = (float)(sz / samples);

  Serial.printf(
    "Gyro bias x=%.4f y=%.4f z=%.4f dps\n",
    (double)gyro_bias_x_dps,
    (double)gyro_bias_y_dps,
    (double)gyro_bias_z_dps
  );
  return true;
}

static uint8_t computeQuality(float ax_g, float ay_g, float az_g, float gx_dps, float gy_dps, float gz_dps) {
  float accel_norm = sqrtf(ax_g * ax_g + ay_g * ay_g + az_g * az_g);
  float accel_err = fabsf(accel_norm - 1.0f);
  float accel_score = 100.0f - fminf(100.0f, accel_err * 220.0f);

  float gyro_mag = sqrtf(gx_dps * gx_dps + gy_dps * gy_dps + gz_dps * gz_dps);
  float gyro_score = 100.0f - fminf(100.0f, gyro_mag * 2.5f);

  float yaw_rate_score = 100.0f - fminf(100.0f, fabsf(gz_dps) * 2.0f);

  float q = 0.45f * accel_score + 0.35f * gyro_score + 0.20f * yaw_rate_score;
  if (q < 0.0f) q = 0.0f;
  if (q > 100.0f) q = 100.0f;
  return (uint8_t)(q + 0.5f);
}

static void updateImu() {
  if (!g_mpu_ok) return;

  int16_t ax_raw = 0, ay_raw = 0, az_raw = 0;
  int16_t gx_raw = 0, gy_raw = 0, gz_raw = 0;
  if (!readAccelGyroRaw(ax_raw, ay_raw, az_raw, gx_raw, gy_raw, gz_raw)) return;

  uint32_t now = millis();
  float dt = (last_imu_ms == 0) ? 0.01f : (float)(now - last_imu_ms) / 1000.0f;
  last_imu_ms = now;
  if (dt <= 0.0f || dt > 0.2f) dt = 0.01f;

  float ax_g = (float)ax_raw / ACCEL_LSB_PER_G;
  float ay_g = (float)ay_raw / ACCEL_LSB_PER_G;
  float az_g = (float)az_raw / ACCEL_LSB_PER_G;

  float gx_dps = ((float)gx_raw / GYRO_LSB_PER_DPS) - gyro_bias_x_dps;
  float gy_dps = ((float)gy_raw / GYRO_LSB_PER_DPS) - gyro_bias_y_dps;
  float gz_dps = ((float)gz_raw / GYRO_LSB_PER_DPS) - gyro_bias_z_dps;

  float pitch_acc = atan2f(ay_g, sqrtf(ax_g * ax_g + az_g * az_g)) * RAD_TO_DEG;
  float roll_acc = atan2f(-ax_g, sqrtf(ay_g * ay_g + az_g * az_g)) * RAD_TO_DEG;

  float pitch_gyro = pitch_deg + gx_dps * dt;
  float roll_gyro = roll_deg + gy_dps * dt;

  pitch_deg = ALPHA * pitch_gyro + (1.0f - ALPHA) * pitch_acc;
  roll_deg = ALPHA * roll_gyro + (1.0f - ALPHA) * roll_acc;

  yaw_deg = wrap_deg(yaw_deg + gz_dps * dt);

  #if RECENTER_BUTTON_ENABLED
  bool btn = (digitalRead(PIN_RECENTER_BUTTON) == LOW);
  if (btn && !prev_button) {
    button_pressed_ms = now;
  }
  if (!btn && prev_button && (now - button_pressed_ms) < 1200) {
    yaw_offset = yaw_deg;
    auto_recenter_done = true;
    Serial.printf("Manual recenter yaw offset=%.2f\n", (double)yaw_offset);
  }
  prev_button = btn;
  #endif

  if (!auto_recenter_done && (now - boot_ms) >= AUTO_RECENTER_DELAY_MS) {
    yaw_offset = yaw_deg;
    auto_recenter_done = true;
    Serial.printf("Auto recenter yaw offset=%.2f\n", (double)yaw_offset);
  }
}

static void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting WiFi SSID=%s\n", WIFI_SSID);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 20000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    g_wifi_ok = true;
    Serial.print("WiFi connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    g_wifi_ok = false;
    Serial.println("WiFi connect timeout");
  }
}

static void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    g_wifi_ok = true;
    return;
  }

  g_wifi_ok = false;
  static uint32_t last_retry_ms = 0;
  uint32_t now = millis();
  if ((now - last_retry_ms) >= 3000) {
    last_retry_ms = now;
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.println("Retry WiFi...");
  }
}

static void sendTelemetry() {
  if (!g_wifi_ok || !g_mpu_ok) return;

  int16_t ax_raw = 0, ay_raw = 0, az_raw = 0;
  int16_t gx_raw = 0, gy_raw = 0, gz_raw = 0;
  if (!readAccelGyroRaw(ax_raw, ay_raw, az_raw, gx_raw, gy_raw, gz_raw)) return;

  float ax_g = (float)ax_raw / ACCEL_LSB_PER_G;
  float ay_g = (float)ay_raw / ACCEL_LSB_PER_G;
  float az_g = (float)az_raw / ACCEL_LSB_PER_G;
  float gx_dps = ((float)gx_raw / GYRO_LSB_PER_DPS) - gyro_bias_x_dps;
  float gy_dps = ((float)gy_raw / GYRO_LSB_PER_DPS) - gyro_bias_y_dps;
  float gz_dps = ((float)gz_raw / GYRO_LSB_PER_DPS) - gyro_bias_z_dps;

  uint8_t quality = computeQuality(ax_g, ay_g, az_g, gx_dps, gy_dps, gz_dps);

  uint8_t flags = 0;
  flags |= FLAG_IMU_ONLY_MODE;
  if (auto_recenter_done) flags |= FLAG_AUTO_RECENTER_DONE;

  float yaw_out = wrap_deg(yaw_deg - yaw_offset);

  uint8_t pkt[FDW_TELEMETRY_SIZE];
  size_t i = 0;
  pkt[i++] = FDW_MAGIC0;
  pkt[i++] = FDW_MAGIC1;
  pkt[i++] = FDW_VERSION;
  pkt[i++] = FDW_MSG_TELEMETRY;
  pkt[i++] = PLAYER_ID;

  write_u16_le(&pkt[i], seq++);
  i += 2;

  write_u32_le(&pkt[i], millis());
  i += 4;

  write_u16_le(&pkt[i], (uint16_t)deg_to_cd(yaw_out));
  i += 2;
  write_u16_le(&pkt[i], (uint16_t)deg_to_cd(pitch_deg));
  i += 2;
  write_u16_le(&pkt[i], (uint16_t)deg_to_cd(roll_deg));
  i += 2;

  pkt[i++] = quality;

  write_u32_le(&pkt[i], 0); // pos_x_cm
  i += 4;
  write_u32_le(&pkt[i], 0); // pos_y_cm
  i += 4;

  pkt[i++] = 0; // pos_quality

  write_u16_le(&pkt[i], 3700); // battery_mv placeholder
  i += 2;

  pkt[i++] = flags;

  uint16_t crc = crc16_ccitt_false(pkt, i);
  write_u16_le(&pkt[i], crc);
  i += 2;

  if (i != FDW_TELEMETRY_SIZE) return;

  udp.beginPacket(SERVER_IP, SERVER_UDP_PORT);
  udp.write(pkt, FDW_TELEMETRY_SIZE);
  udp.endPacket();
}

static void pollAlertPacket() {
  int size = udp.parsePacket();
  if (size <= 0) return;

  uint8_t buf[64];
  if ((size_t)size > sizeof(buf)) {
    while (udp.available()) udp.read();
    return;
  }

  int read_n = udp.read(buf, size);
  if (read_n != size) return;
  if ((size_t)size != FDW_ALERT_SIZE) return;

  if (buf[0] != FDW_MAGIC0 || buf[1] != FDW_MAGIC1) return;
  if (buf[2] != FDW_VERSION || buf[3] != FDW_MSG_ALERT) return;

  uint16_t recv_crc = read_u16_le(&buf[FDW_ALERT_SIZE - 2]);
  uint16_t calc_crc = crc16_ccitt_false(buf, FDW_ALERT_SIZE - 2);
  if (recv_crc != calc_crc) return;

  uint8_t player_id = buf[4];
  uint8_t on = buf[5];
  uint8_t intensity = buf[6];
  uint16_t hold_ms = read_u16_le(&buf[7]);

  if (player_id != PLAYER_ID) return;

  uint32_t now = millis();
  if (on) {
    alert_on = true;
    alert_intensity = intensity;
    alert_hold_until_ms = now + hold_ms;
  } else if ((int32_t)(now - alert_hold_until_ms) >= 0) {
    alert_on = false;
    alert_intensity = 0;
  }
}

static void updateAlertOutput() {
  uint32_t now = millis();
  if (alert_on && (int32_t)(now - alert_hold_until_ms) >= 0) {
    alert_on = false;
    alert_intensity = 0;
  }

  digitalWrite(PIN_ALERT_OUTPUT, alert_on ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("FDW MPU6050 node boot");
  Serial.printf("Board profile: %d\\n", (int)BOARD_PROFILE);
  Serial.printf("I2C SDA=%d SCL=%d ALERT_PIN=%d\\n", PIN_SDA, PIN_SCL, PIN_ALERT_OUTPUT);

  pinMode(PIN_ALERT_OUTPUT, OUTPUT);
  digitalWrite(PIN_ALERT_OUTPUT, LOW);

#if RECENTER_BUTTON_ENABLED
  pinMode(PIN_RECENTER_BUTTON, INPUT_PULLUP);
#endif

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  g_mpu_ok = mpuInit();
  if (!g_mpu_ok) {
    Serial.println("MPU6050 init failed");
  } else {
    Serial.println("MPU6050 init OK");
    Serial.println("Keep sensor still for gyro calibration");
    if (!calibrateGyroBias()) {
      Serial.println("Gyro calibration failed");
    }
  }

  connectWifi();
  udp.begin(LOCAL_UDP_PORT);

  boot_ms = millis();
  last_imu_ms = boot_ms;
  last_tx_ms = boot_ms;
}

void loop() {
  ensureWifi();
  updateImu();

  uint32_t now = millis();
  const uint32_t tx_period_ms = (1000u / TELEMETRY_RATE_HZ);
  if ((now - last_tx_ms) >= tx_period_ms) {
    last_tx_ms = now;
    sendTelemetry();
  }

  pollAlertPacket();
  updateAlertOutput();

  static uint32_t last_log_ms = 0;
  if ((now - last_log_ms) >= 1000) {
    last_log_ms = now;
    Serial.printf(
      "wifi=%d mpu=%d yaw=%.1f pitch=%.1f roll=%.1f q? alert=%d intensity=%u\n",
      g_wifi_ok ? 1 : 0,
      g_mpu_ok ? 1 : 0,
      (double)wrap_deg(yaw_deg - yaw_offset),
      (double)pitch_deg,
      (double)roll_deg,
      alert_on ? 1 : 0,
      (unsigned)clamp_u8_int(alert_intensity)
    );
  }

  delay(2);
}
