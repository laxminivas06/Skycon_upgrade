# SKYCON Optical & Sensor Specifications: SPI 100, Pixel Metrics & Target Geometry

## 1. Executive Summary & Standards
In the **SAE INDIA / ADDC Autonomous Drone Rescue & QR Mission**, rapid and reliable identification of ground targets requires strict alignment between:
1. Physical target printing resolution (SPI / DPI standards).
2. Physical QR code bounding box dimensions.
3. Camera sensor optics (focal length, field of view, pixel pitch, sensor resolution).
4. Flight altitude envelopes ($5.0\text{m}$ to $15.0\text{m}$ AGL).
5. Ground Sampling Distance (GSD) and Nyquist optical sampling limits for QR module decoding.

---

## 2. SPI 100 Printing Specification

### 2.1 Definition & Standards
- **SPI (Samples / Spots Per Inch) / DPI (Dots Per Inch)**:
  - The competition target boxes feature QR codes printed with a minimum spatial resolution of **100 SPI (100 dots/inch)**.
  - $1\text{ inch} = 25.4\text{ mm} \implies 100\text{ SPI} = 3.937\text{ dots/mm}$ ($0.254\text{ mm/spot}$).
- **Target Dimensions**:
  - Target Box: Cardboard cuboid with a white top-face ($200\text{ mm} \times 200\text{ mm}$ to $300\text{ mm} \times 300\text{ mm}$).
  - Active QR Code: $150\text{ mm} \times 150\text{ mm}$ ($15\text{ cm} \times 15\text{ cm}$) centered on the top face.
  - Quiet Zone: Minimum $4\times$ module width border around the QR pattern.
  - Payload Format: Exactly two numeric digits matching regex `^\d{2}$` (Version 1 or Version 2 QR code, 21x21 or 25x25 matrix).

### 2.2 QR Module Physical Sizing
For a Version 2 QR Code ($25 \times 25$ grid modules) within an active area of $150\text{ mm} \times 150\text{ mm}$:
$$\text{Physical Module Width } (W_m) = \frac{150\text{ mm}}{25} = 6.0\text{ mm}$$
For a Version 1 QR Code ($21 \times 21$ grid modules):
$$W_m = \frac{150\text{ mm}}{21} \approx 7.14\text{ mm}$$

---

## 3. Optical Sensor & Pixel Geometry

### 3.1 Smartphone Camera Sensor Model (Mounted Onboard)
The primary video stream is provided by a mounted smartphone running at $1280 \times 720$ (HD) or $1920 \times 1080$ (Full HD) at 30/60 FPS.
- **Sensor Type**: $1/2.55\text{-inch}$ CMOS sensor.
- **Physical Sensor Width ($S_w$)**: $5.76\text{ mm}$.
- **Physical Sensor Height ($S_h$)**: $3.24\text{ mm}$ ($16:9$ crop).
- **Pixel Pitch ($p$)**: $1.4\ \mu\text{m} = 0.0014\text{ mm/pixel}$.
- **Effective Focal Length ($f$)**: $4.25\text{ mm}$ (approx. $26\text{ mm}$ full-frame equivalent).
- **Horizontal Field of View (HFOV)**: $68.0^\circ$ ($1.1868\text{ rad}$).
- **Vertical Field of View (VFOV)**: $54.0^\circ$ ($0.9425\text{ rad}$).
- **Native Resolution**: $1280 \times 720\text{ pixels}$.
- **Principal Point ($c_x, c_y$)**: $(640.0, 360.0)$.

### 3.2 Ground Sampling Distance (GSD) Calculations
Ground Sampling Distance ($GSD$) is the physical distance on the ground represented by each image pixel:
$$GSD_h = \frac{Altitude \times S_w}{f \times \text{Image Width}} = \frac{H \times 5.76\text{ mm}}{4.25\text{ mm} \times 1280} = H \times 0.0010588\text{ m/pixel}$$

| Flight Altitude ($H$) | $GSD$ ($\text{mm/pixel}$) | Physical Footprint ($1280 \times 720$) | QR Module Width in Pixels ($6\text{mm module}$) |
| :--- | :--- | :--- | :--- |
| **$3.0\text{m}$ (Descent/Decode)** | $3.18\text{ mm/pixel}$ | $4.07\text{m} \times 2.29\text{m}$ | **$1.89 \approx 2\text{ pixels}$** (Raw) / **$3.8\text{ pixels}$** ($1080p$) |
| **$5.0\text{m}$ (Nominal Orbit)** | $5.29\text{ mm/pixel}$ | $6.78\text{m} \times 3.81\text{m}$ | **$1.13\text{ pixels}$** |
| **$8.0\text{m}$ (Mid Search)** | $8.47\text{ mm/pixel}$ | $10.84\text{m} \times 6.10\text{m}$ | **$0.71\text{ pixels}$** |
| **$10.0\text{m}$ (Search Pattern)**| $10.59\text{ mm/pixel}$ | $13.55\text{m} \times 7.62\text{m}$ | **$0.57\text{ pixels}$** |
| **$15.0\text{m}$ (High Recon)** | $15.88\text{ mm/pixel}$ | $20.33\text{m} \times 11.43\text{m}$| **$0.38\text{ pixels}$** |

---

## 4. Multi-Stage Operational Strategy (A/B Protocol)

### 4.1 Nyquist Optical Sampling Limit
To reliably decode a 2D QR code using standard Reed-Solomon decoders (OpenCV / PyZbar / WeChatQR), **each QR module must span at least $2.5$ to $3.0$ consecutive pixels**:
$$W_{m, \text{pixels}} \ge 2.5\text{ pixels}$$
At search altitudes above $5.0\text{m}$, raw pixels per module drop below this threshold ($0.57$ to $1.13$ pixels/module), making direct single-frame QR decoding optically impossible without descent or high optical zoom.

### 4.2 Solution: Two-Stage Autonomous Protocol
1. **Stage A: Search & Box Detection ($H = 8\text{m} - 10\text{m}$)**:
   - Target: Cardboard box top-face ($200\text{ mm} \times 200\text{ mm}$).
   - Box size in pixels at $10\text{m}$: $\approx 19 \times 19\text{ pixels}$.
   - The detector triggers on geometric contrast and color thresholding (HSV / Contours / YOLO-nano).
   - Drone logs spatial candidate and refines georeferencing without sudden braking.
2. **Stage B: Precision Descent & QR Read ($H = 2.5\text{m} - 3.5\text{m}$)**:
   - Visual servoing centers the drone above the georeferenced coordinates.
   - Drone descends to $3.0\text{m}$ AGL.
   - At $3.0\text{m}$ with digital crop / $1080p$ sensor ingest:
     $$W_{m, \text{pixels}} = \frac{6.0\text{ mm}}{3.18\text{ mm/pixel}} \times 1.5\text{ (crop zoom)} \approx 2.83\text{ pixels}$$
   - WeChat-QR subpixel super-resolution module reconstructs edges.
   - Decoded string validated against regex `^\d{2}$` within $< 80\text{ ms}$.

---

## 5. Pinhole Coordinate Transformations

### 5.1 Pixel Coordinate System
- Normalized image plane coordinates $(x_n, y_n)$:
  $$x_n = \frac{u - c_x}{f_x}, \quad y_n = \frac{v - c_y}{f_y}$$
- Body-frame displacement vector:
  $$\mathbf{P}_{\text{body}} = \begin{bmatrix} X_b \\ Y_b \\ Z_b \end{bmatrix} = \begin{bmatrix} y_n \cdot Z_{\text{AGL}} \\ x_n \cdot Z_{\text{AGL}} \\ Z_{\text{AGL}} \end{bmatrix}$$

### 5.2 3D Attitude Rotation (Euler Yaw-Pitch-Roll Correction)
To correct for drone tilt during wind compensation:
$$\mathbf{P}_{\text{NED}} = \mathbf{R}_z(\psi) \mathbf{R}_y(\theta) \mathbf{R}_x(\phi) \cdot \mathbf{P}_{\text{body}}$$
Where:
- $\phi = \text{Roll angle}$
- $\theta = \text{Pitch angle}$
- $\psi = \text{True Heading (Yaw)}$

Target Geodetic Coordinates:
$$\text{Lat}_{\text{target}} = \text{Lat}_{\text{drone}} + \frac{P_{\text{North}}}{R_{\text{Earth}}} \cdot \frac{180}{\pi}$$
$$\text{Lon}_{\text{target}} = \text{Lon}_{\text{drone}} + \frac{P_{\text{East}}}{R_{\text{Earth}} \cos(\text{Lat}_{\text{drone}})} \cdot \frac{180}{\pi}$$
Where $R_{\text{Earth}} = 6,378,137.0\text{ m}$.

---

## 6. Lens Distortion & Subpixel Calibration
The pipeline implements the **Brown-Conrady 5-parameter radial/tangential distortion model**:
$$r^2 = x_n^2 + y_n^2$$
$$x_d = x_n(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2 p_1 x_n y_n + p_2(r^2 + 2 x_n^2)$$
$$y_d = y_n(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1(r^2 + 2 y_n^2) + 2 p_2 x_n y_n$$

Camera calibration coefficients are stored in `backend/app/drone/config.py` and updated through the Ground Station calibration card.
