#pragma once

#include <stdbool.h>

typedef struct {
    float q0;
    float q1;
    float q2;
    float q3;
    float beta;
    bool initialized;
} madgwick_t;

void madgwick_init(madgwick_t *filt, float beta);
void madgwick_update(
    madgwick_t *filt,
    float dt_s,
    float gx_rad_s,
    float gy_rad_s,
    float gz_rad_s,
    float ax,
    float ay,
    float az,
    float mx,
    float my,
    float mz
);
void madgwick_update_imu(
    madgwick_t *filt,
    float dt_s,
    float gx_rad_s,
    float gy_rad_s,
    float gz_rad_s,
    float ax,
    float ay,
    float az
);
void madgwick_get_ypr_deg(const madgwick_t *filt, float *yaw_deg, float *pitch_deg, float *roll_deg);
