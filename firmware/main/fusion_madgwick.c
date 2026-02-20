#include "fusion_madgwick.h"

#include <math.h>

static float inv_sqrt(float x) {
    if (x <= 0.0f) {
        return 0.0f;
    }
    return 1.0f / sqrtf(x);
}

void madgwick_init(madgwick_t *filt, float beta) {
    filt->q0 = 1.0f;
    filt->q1 = 0.0f;
    filt->q2 = 0.0f;
    filt->q3 = 0.0f;
    filt->beta = beta;
    filt->initialized = true;
}

void madgwick_update(
    madgwick_t *filt,
    float dt_s,
    float gx,
    float gy,
    float gz,
    float ax,
    float ay,
    float az,
    float mx,
    float my,
    float mz
) {
    if (filt == NULL || dt_s <= 0.0f) {
        return;
    }

    float q1 = filt->q0;
    float q2 = filt->q1;
    float q3 = filt->q2;
    float q4 = filt->q3;

    float norm = inv_sqrt(ax * ax + ay * ay + az * az);
    if (norm == 0.0f) {
        return;
    }
    ax *= norm;
    ay *= norm;
    az *= norm;

    norm = inv_sqrt(mx * mx + my * my + mz * mz);
    if (norm == 0.0f) {
        return;
    }
    mx *= norm;
    my *= norm;
    mz *= norm;

    float _2q1mx = 2.0f * q1 * mx;
    float _2q1my = 2.0f * q1 * my;
    float _2q1mz = 2.0f * q1 * mz;
    float _2q2mx = 2.0f * q2 * mx;
    float _2q1 = 2.0f * q1;
    float _2q2 = 2.0f * q2;
    float _2q3 = 2.0f * q3;
    float _2q4 = 2.0f * q4;
    float _2q1q3 = 2.0f * q1 * q3;
    float _2q3q4 = 2.0f * q3 * q4;
    float q1q1 = q1 * q1;
    float q1q2 = q1 * q2;
    float q1q3 = q1 * q3;
    float q1q4 = q1 * q4;
    float q2q2 = q2 * q2;
    float q2q3 = q2 * q3;
    float q2q4 = q2 * q4;
    float q3q3 = q3 * q3;
    float q3q4 = q3 * q4;
    float q4q4 = q4 * q4;

    float hx = mx * q1q1 - _2q1my * q4 + _2q1mz * q3 + mx * q2q2 + _2q2 * my * q3 + _2q2 * mz * q4 -
               mx * q3q3 - mx * q4q4;
    float hy = _2q1mx * q4 + my * q1q1 - _2q1mz * q2 + _2q2mx * q3 - my * q2q2 + my * q3q3 +
               _2q3 * mz * q4 - my * q4q4;
    float _2bx = sqrtf(hx * hx + hy * hy);
    float _2bz = -_2q1mx * q3 + _2q1my * q2 + mz * q1q1 + _2q2mx * q4 - mz * q2q2 +
                 _2q3 * my * q4 - mz * q3q3 + mz * q4q4;
    float _4bx = 2.0f * _2bx;
    float _4bz = 2.0f * _2bz;

    float s1 = -_2q3 * (2.0f * q2q4 - _2q1q3 - ax) + _2q2 * (2.0f * q1q2 + _2q3q4 - ay) -
               _2bz * q3 * (_2bx * (0.5f - q3q3 - q4q4) + _2bz * (q2q4 - q1q3) - mx) +
               (-_2bx * q4 + _2bz * q2) * (_2bx * (q2q3 - q1q4) + _2bz * (q1q2 + q3q4) - my) +
               _2bx * q3 * (_2bx * (q1q3 + q2q4) + _2bz * (0.5f - q2q2 - q3q3) - mz);
    float s2 = _2q4 * (2.0f * q2q4 - _2q1q3 - ax) + _2q1 * (2.0f * q1q2 + _2q3q4 - ay) -
               4.0f * q2 * (1.0f - 2.0f * q2q2 - 2.0f * q3q3 - az) +
               _2bz * q4 * (_2bx * (0.5f - q3q3 - q4q4) + _2bz * (q2q4 - q1q3) - mx) +
               (_2bx * q3 + _2bz * q1) * (_2bx * (q2q3 - q1q4) + _2bz * (q1q2 + q3q4) - my) +
               (_2bx * q4 - _4bz * q2) * (_2bx * (q1q3 + q2q4) + _2bz * (0.5f - q2q2 - q3q3) - mz);
    float s3 = -_2q1 * (2.0f * q2q4 - _2q1q3 - ax) + _2q4 * (2.0f * q1q2 + _2q3q4 - ay) -
               4.0f * q3 * (1.0f - 2.0f * q2q2 - 2.0f * q3q3 - az) +
               (-_4bx * q3 - _2bz * q1) * (_2bx * (0.5f - q3q3 - q4q4) + _2bz * (q2q4 - q1q3) - mx) +
               (_2bx * q2 + _2bz * q4) * (_2bx * (q2q3 - q1q4) + _2bz * (q1q2 + q3q4) - my) +
               (_2bx * q1 - _4bz * q3) * (_2bx * (q1q3 + q2q4) + _2bz * (0.5f - q2q2 - q3q3) - mz);
    float s4 = _2q2 * (2.0f * q2q4 - _2q1q3 - ax) + _2q3 * (2.0f * q1q2 + _2q3q4 - ay) +
               (-_4bx * q4 + _2bz * q2) * (_2bx * (0.5f - q3q3 - q4q4) + _2bz * (q2q4 - q1q3) - mx) +
               (-_2bx * q1 + _2bz * q3) * (_2bx * (q2q3 - q1q4) + _2bz * (q1q2 + q3q4) - my) +
               _2bx * q2 * (_2bx * (q1q3 + q2q4) + _2bz * (0.5f - q2q2 - q3q3) - mz);

    norm = inv_sqrt(s1 * s1 + s2 * s2 + s3 * s3 + s4 * s4);
    if (norm != 0.0f) {
        s1 *= norm;
        s2 *= norm;
        s3 *= norm;
        s4 *= norm;
    }

    float q_dot1 = 0.5f * (-q2 * gx - q3 * gy - q4 * gz) - filt->beta * s1;
    float q_dot2 = 0.5f * (q1 * gx + q3 * gz - q4 * gy) - filt->beta * s2;
    float q_dot3 = 0.5f * (q1 * gy - q2 * gz + q4 * gx) - filt->beta * s3;
    float q_dot4 = 0.5f * (q1 * gz + q2 * gy - q3 * gx) - filt->beta * s4;

    q1 += q_dot1 * dt_s;
    q2 += q_dot2 * dt_s;
    q3 += q_dot3 * dt_s;
    q4 += q_dot4 * dt_s;

    norm = inv_sqrt(q1 * q1 + q2 * q2 + q3 * q3 + q4 * q4);
    if (norm == 0.0f) {
        return;
    }
    filt->q0 = q1 * norm;
    filt->q1 = q2 * norm;
    filt->q2 = q3 * norm;
    filt->q3 = q4 * norm;
}

void madgwick_update_imu(
    madgwick_t *filt,
    float dt_s,
    float gx,
    float gy,
    float gz,
    float ax,
    float ay,
    float az
) {
    if (filt == NULL || dt_s <= 0.0f) {
        return;
    }

    float q0 = filt->q0;
    float q1 = filt->q1;
    float q2 = filt->q2;
    float q3 = filt->q3;

    float q_dot0 = 0.5f * (-q1 * gx - q2 * gy - q3 * gz);
    float q_dot1 = 0.5f * (q0 * gx + q2 * gz - q3 * gy);
    float q_dot2 = 0.5f * (q0 * gy - q1 * gz + q3 * gx);
    float q_dot3 = 0.5f * (q0 * gz + q1 * gy - q2 * gx);

    if (!(ax == 0.0f && ay == 0.0f && az == 0.0f)) {
        float norm = inv_sqrt(ax * ax + ay * ay + az * az);
        if (norm == 0.0f) {
            return;
        }
        ax *= norm;
        ay *= norm;
        az *= norm;

        float _2q0 = 2.0f * q0;
        float _2q1 = 2.0f * q1;
        float _2q2 = 2.0f * q2;
        float _2q3 = 2.0f * q3;
        float _4q0 = 4.0f * q0;
        float _4q1 = 4.0f * q1;
        float _4q2 = 4.0f * q2;
        float _8q1 = 8.0f * q1;
        float _8q2 = 8.0f * q2;
        float q0q0 = q0 * q0;
        float q1q1 = q1 * q1;
        float q2q2 = q2 * q2;
        float q3q3 = q3 * q3;

        float s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay;
        float s1 = _4q1 * q3q3 - _2q3 * ax + 4.0f * q0q0 * q1 - _2q0 * ay - _4q1 + _8q1 * q1q1 + _8q1 * q2q2 +
                   _4q1 * az;
        float s2 = 4.0f * q0q0 * q2 + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2 + _8q2 * q1q1 + _8q2 * q2q2 +
                   _4q2 * az;
        float s3 = 4.0f * q1q1 * q3 - _2q1 * ax + 4.0f * q2q2 * q3 - _2q2 * ay;

        norm = inv_sqrt(s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3);
        if (norm != 0.0f) {
            s0 *= norm;
            s1 *= norm;
            s2 *= norm;
            s3 *= norm;
        }

        q_dot0 -= filt->beta * s0;
        q_dot1 -= filt->beta * s1;
        q_dot2 -= filt->beta * s2;
        q_dot3 -= filt->beta * s3;
    }

    q0 += q_dot0 * dt_s;
    q1 += q_dot1 * dt_s;
    q2 += q_dot2 * dt_s;
    q3 += q_dot3 * dt_s;

    float norm = inv_sqrt(q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3);
    if (norm == 0.0f) {
        return;
    }

    filt->q0 = q0 * norm;
    filt->q1 = q1 * norm;
    filt->q2 = q2 * norm;
    filt->q3 = q3 * norm;
}

void madgwick_get_ypr_deg(const madgwick_t *filt, float *yaw_deg, float *pitch_deg, float *roll_deg) {
    float q0 = filt->q0;
    float q1 = filt->q1;
    float q2 = filt->q2;
    float q3 = filt->q3;

    float yaw = atan2f(2.0f * (q0 * q3 + q1 * q2), 1.0f - 2.0f * (q2 * q2 + q3 * q3));
    float pitch = asinf(2.0f * (q0 * q2 - q3 * q1));
    float roll = atan2f(2.0f * (q0 * q1 + q2 * q3), 1.0f - 2.0f * (q1 * q1 + q2 * q2));

    const float rad_to_deg = 57.2957795f;
    if (yaw_deg != NULL) {
        *yaw_deg = yaw * rad_to_deg;
    }
    if (pitch_deg != NULL) {
        *pitch_deg = pitch * rad_to_deg;
    }
    if (roll_deg != NULL) {
        *roll_deg = roll * rad_to_deg;
    }
}
