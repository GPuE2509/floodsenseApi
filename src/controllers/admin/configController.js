const SystemConfig = require('../../models/SystemConfig');

class ConfigController {
  async updateConfig(req, res) {
    try {
      const {
        water_level_l1,
        water_level_l2,
        water_level_l3,
        water_level_l4,
        water_rising_speed_threshold,
        module_forum,
        module_chat,
        module_rescue,
        module_map,
        module_extensions,
        module_forecast
      } = req.body;

      // Validation check: levels must be in ascending order
      if (water_level_l1 !== undefined && water_level_l2 !== undefined && water_level_l1 >= water_level_l2) {
        return res.status(400).json({ success: false, message: 'Level 1 must be less than Level 2' });
      }
      if (water_level_l2 !== undefined && water_level_l3 !== undefined && water_level_l2 >= water_level_l3) {
        return res.status(400).json({ success: false, message: 'Level 2 must be less than Level 3' });
      }
      if (water_level_l3 !== undefined && water_level_l4 !== undefined && water_level_l3 >= water_level_l4) {
        return res.status(400).json({ success: false, message: 'Level 3 must be less than Level 4' });
      }

      let config = await SystemConfig.findOne({ key: 'default' });
      if (!config) {
        config = new SystemConfig({ key: 'default' });
      }

      if (water_level_l1 !== undefined) config.water_level_l1 = water_level_l1;
      if (water_level_l2 !== undefined) config.water_level_l2 = water_level_l2;
      if (water_level_l3 !== undefined) config.water_level_l3 = water_level_l3;
      if (water_level_l4 !== undefined) config.water_level_l4 = water_level_l4;
      if (water_rising_speed_threshold !== undefined) config.water_rising_speed_threshold = water_rising_speed_threshold;

      if (module_forum !== undefined) config.module_forum = module_forum;
      if (module_chat !== undefined) config.module_chat = module_chat;
      if (module_rescue !== undefined) config.module_rescue = module_rescue;
      if (module_map !== undefined) config.module_map = module_map;
      if (module_forecast !== undefined) config.module_forecast = module_forecast;
      if (module_extensions !== undefined) config.module_extensions = module_extensions;

      await config.save();

      // Log FEATURE_TOGGLE action
      if (req.user) {
        try {
          const SystemLog = require('../../models/SystemLog');
          await SystemLog.create({
            operator_id: req.user._id,
            action: 'FEATURE_TOGGLE',
            target_id: config._id,
            reason: `Updated system configurations and modules status (Forum: ${config.module_forum ? 'ON' : 'OFF'}, Chat: ${config.module_chat ? 'ON' : 'OFF'}, Rescue: ${config.module_rescue ? 'ON' : 'OFF'}, Map: ${config.module_map ? 'ON' : 'OFF'}, Forecast: ${config.module_forecast ? 'ON' : 'OFF'}, Ext: ${config.module_extensions ? 'ON' : 'OFF'})`
          });
        } catch (logErr) {
          console.error('Failed to create system log for configuration change:', logErr);
        }
      }

      // Recalculate warning_water_status for all devices based on the new config
      const IotDevice = require('../../models/IotDevice');
      const devices = await IotDevice.find({});
      for (const device of devices) {
        await device.save();
      }

      // Broadcast changes in real-time to all connected WebSocket clients
      const wss = req.app.get('wss');
      if (wss) {
        const payload = JSON.stringify({ type: 'system_config_changed', config });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(payload);
        });
      }

      res.status(200).json({
        success: true,
        data: config,
        message: 'System configuration updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ConfigController();
