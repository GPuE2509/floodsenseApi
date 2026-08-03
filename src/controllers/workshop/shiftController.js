const shiftService = require('../../services/workshop/shiftService');
const profileService = require('../../services/workshop/profileService');

exports.getShiftTemplates = async (req, res) => {
  try {
    const workshop = await profileService.getWorkshop(req.user._id);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found.' });
    }
    const templates = await shiftService.getShiftTemplates(workshop._id);
    return res.status(200).json(templates);
  } catch (error) {
    console.error('Error fetching shift templates:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getWeeklySchedule = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    
    const workshop = await profileService.getWorkshop(req.user._id);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found.' });
    }
    
    const data = await shiftService.getWeeklySchedule(workshop._id, startDate, endDate);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching weekly schedule:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.saveWeeklySchedule = async (req, res) => {
  try {
    const workshop = await profileService.getWorkshop(req.user._id);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found.' });
    }
    
    const result = await shiftService.saveWeeklySchedule(workshop._id, req.user._id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error saving weekly schedule:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateShiftTemplate = async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({ message: 'startTime and endTime are required' });
    }

    const workshop = await profileService.getWorkshop(req.user._id);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found.' });
    }
    
    const template = await shiftService.updateShiftTemplate(workshop._id, req.params.templateId, startTime, endTime);
    return res.status(200).json(template);
  } catch (error) {
    console.error('Error updating shift template:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
