const IotService = require('../../services/iot/IotService');
const { handleImageUpload } = require('../../utils/uploadHelper');

class IotController {
  async getAllDevices(req, res) {
    try {
      const { search } = req.query;
      const devices = await IotService.getAllDevices(search);
      res.status(200).json({
        success: true,
        data: devices
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDeviceDetails(req, res) {
    try {
      const { id } = req.params;
      const device = await IotService.getDeviceById(id);
      res.status(200).json({
        success: true,
        data: device
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async addDevice(req, res) {
    try {
      const data = { ...req.body };
      
      // Handle image upload if a file was provided
      if (req.file) {
        // Upload to Cloudinary using utility
        const uploadResult = await handleImageUpload(
          req.file.buffer, 
          'smart-flood-traffic/iot-devices', 
          'system', 
          'iot-device'
        );
        data.image_url = uploadResult.secure_url || uploadResult.url;
      }

      const device = await IotService.addDevice(data);
      res.status(201).json({
        success: true,
        data: device
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateDevice(req, res) {
    try {
      const { id } = req.params;
      const data = { ...req.body };
      
      // Handle image upload if a file was provided
      if (req.file) {
        // Upload to Cloudinary using utility
        const uploadResult = await handleImageUpload(
          req.file.buffer, 
          'smart-flood-traffic/iot-devices', 
          'system', 
          'iot-device'
        );
        data.image_url = uploadResult.secure_url || uploadResult.url;
      }

      const device = await IotService.updateDevice(id, data);
      res.status(200).json({
        success: true,
        data: device
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async receiveTelemetry(req, res) {
    try {
      const data = req.body;
      if (!data || data.lat === undefined || data.lon === undefined) {
        return res.status(400).send('Bad Request: Missing lat/lon');
      }

      const deviceId = data.device_id || 'UNKNOWN';
      const waterLevel = parseFloat(data.water_level || 0);
      const batteryPercent = parseInt(data.battery_percent || 0);
      const now = new Date();

      const updatedDevice = await IotService.updateTelemetry(deviceId, waterLevel, batteryPercent, now);

      // Device is disabled: respond to ESP32 and skip broadcast
      if (updatedDevice?.is_disabled) {
        return res.status(200).json({
          success: true,
          disabled: true,
          message: 'Device is disabled. Data not recorded.'
        });
      }

      // Broadcast telemetry to all connected WebSocket clients (active devices only)
      const wss = req.app.get('wss');
      if (wss && updatedDevice) {
        const payload = JSON.stringify({ type: 'iot_telemetry', device: updatedDevice });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(payload);
        });
      }

      if (updatedDevice) {
        return res.status(200).json({
          success: true,
          disabled: false,
          config: {
            s_calib: updatedDevice.calib_empty_cm ?? 100,
            t_dsleep: updatedDevice.sleep_interval_minutes ?? 1,
            lat: updatedDevice.lat ?? null,
            lon: updatedDevice.lng ?? null
          }
        });
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Error receiving telemetry:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  async getSystemConfig(req, res) {
    try {
      const SystemConfig = require('../../models/SystemConfig');
      let config = await SystemConfig.findOne({ key: 'default' });
      if (!config) {
        config = await SystemConfig.create({ key: 'default' });
      }
      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async toggleDisable(req, res) {
    try {
      const { id } = req.params;
      const { is_disabled } = req.body;

      if (typeof is_disabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'is_disabled must be a boolean value' });
      }

      const device = await IotService.toggleDeviceDisabled(id, is_disabled);

      // Broadcast device_status_changed so ALL connected clients update the map in real-time
      const wss = req.app.get('wss');
      if (wss) {
        const payload = JSON.stringify({
          type: 'device_status_changed',
          device_code: device.device_code,
          is_disabled: device.is_disabled
        });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(payload);
        });
      }

      res.status(200).json({
        success: true,
        data: device,
        message: is_disabled ? 'Device disabled successfully' : 'Device enabled successfully'
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getDeviceHistory(req, res) {
    try {
      const { id } = req.params;
      const historyData = await IotService.getDeviceHistory(id);
      res.status(200).json({
        success: true,
        data: historyData
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDeviceSpeedAnalysis(req, res) {
    try {
      const { id } = req.params;
      const speedData = await IotService.getDeviceSpeedAnalysis(id);
      res.status(200).json({
        success: true,
        data: speedData
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDeviceLogs(req, res) {
    try {
      const { id } = req.params;
      const device = await IotService.getDeviceById(id);
      const Notification = require('../../models/Notification');
      const logs = await Notification.find({ reference_id: device._id })
        .sort({ created_at: -1 })
        .limit(50)
        .lean();
      
      const formattedLogs = logs.map(log => {
        let status = 'info';
        if (log.type === 'System_Alert' || log.type === 'Flood_In_Warning_Zone') {
          if (log.title.includes('Critical') || log.title.includes('Depleted') || log.title.includes('vượt ngưỡng')) status = 'error';
          else if (log.title.includes('Severe') || log.title.includes('Low Battery') || log.title.includes('cảnh báo')) status = 'warning';
        }
        return {
          time: new Date(log.created_at).toLocaleString('vi-VN'),
          event: log.title,
          detail: log.body,
          status
        };
      });

      res.status(200).json({
        success: true,
        data: formattedLogs
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new IotController();
