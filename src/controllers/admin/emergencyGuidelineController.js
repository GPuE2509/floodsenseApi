const guidelineService = require('../../services/emergencyGuidelineService');

exports.getAllGuidelines = async (req, res) => {
  try {
    const guidelines = await guidelineService.getAllGuidelines();
    res.status(200).json({ success: true, data: guidelines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllGuidelinesAdmin = async (req, res) => {
  try {
    const guidelines = await guidelineService.getAllGuidelinesAdmin();
    res.status(200).json({ success: true, data: guidelines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Feature Add Emergency Guideline
exports.createGuideline = async (req, res) => {
  try {
    const guideline = await guidelineService.createGuideline(req.body);
    res.status(201).json({ success: true, data: guideline });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Feature Update Emergency Guideline
exports.updateGuideline = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedGuideline = await guidelineService.updateGuidelineById(id, req.body);
    if (!updatedGuideline) {
      return res.status(404).json({ success: false, message: 'Guideline not found' });
    }
    res.status(200).json({ success: true, data: updatedGuideline });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Feature Delete Emergency Guideline
exports.deleteGuideline = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedGuideline = await guidelineService.deleteGuidelineById(id);
    if (!deletedGuideline) {
      return res.status(404).json({ success: false, message: 'Guideline not found' });
    }
    res.status(200).json({ success: true, message: 'Guideline deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};