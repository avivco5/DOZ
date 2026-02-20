#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

typedef struct {
    const char *ssid;
    const char *password;
    const char *server_ip;
    uint16_t server_port;
    uint16_t local_port;
} net_udp_config_t;

esp_err_t net_udp_init(const net_udp_config_t *cfg);
bool net_udp_is_connected(void);
int net_udp_send(const uint8_t *data, size_t len);
int net_udp_receive(uint8_t *buf, size_t max_len, uint32_t timeout_ms);
