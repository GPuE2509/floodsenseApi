const ShiftTemplate = require('../../models/ShiftTemplate');
const WeeklySchedule = require('../../models/WeeklySchedule');
const ShiftAssignment = require('../../models/ShiftAssignment');
const WorkshopStaff = require('../../models/WorkshopStaff');

const DEFAULT_TEMPLATES = [
  { name: 'FT Morning', type: 'fixed', startTime: '07:00', endTime: '15:00' },
  { name: 'FT Afternoon', type: 'fixed', startTime: '14:00', endTime: '22:00' },
  { name: 'Evening Flex', type: 'flex', startTime: '16:00', endTime: '20:00' },
  { name: 'Night Rescue On-call', type: 'on-call', startTime: '22:00', endTime: '06:00' }
];

exports.getShiftTemplates = async (workshopId) => {
  let templates = await ShiftTemplate.find({ workshopId, isActive: true }).sort({ createdAt: 1 });
  
  if (templates.length === 0) {
    // Initialize default templates
    const newTemplates = DEFAULT_TEMPLATES.map(t => ({
      ...t,
      workshopId
    }));
    templates = await ShiftTemplate.insertMany(newTemplates);
  }
  
  return templates;
};

exports.updateShiftTemplate = async (workshopId, templateId, startTime, endTime) => {
  const template = await ShiftTemplate.findOne({ _id: templateId, workshopId });
  if (!template) throw new Error('Template not found');
  template.startTime = startTime;
  template.endTime = endTime;
  await template.save();
  return template;
};

exports.getWeeklySchedule = async (workshopId, startDateStr, endDateStr) => {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  let schedule = await WeeklySchedule.findOne({
    workshopId,
    startDate: { $lte: startDate },
    endDate: { $gte: endDate }
  });

  if (!schedule) {
    schedule = new WeeklySchedule({
      workshopId,
      startDate,
      endDate,
      status: 'draft'
    });
    await schedule.save();
  }

  const assignments = await ShiftAssignment.find({ scheduleId: schedule._id })
    .populate('staffId', 'full_name')
    .lean();

  return { schedule, assignments };
};

exports.saveWeeklySchedule = async (workshopId, assignedBy, payload) => {
  const { startDate, endDate, assignments, duplicateWeeks } = payload;
  
  const weeksToSave = (duplicateWeeks && !isNaN(duplicateWeeks)) ? parseInt(duplicateWeeks) + 1 : 1;

  for (let i = 0; i < weeksToSave; i++) {
    const currentStartDate = new Date(startDate);
    currentStartDate.setDate(currentStartDate.getDate() + (i * 7));
    const currentEndDate = new Date(endDate);
    currentEndDate.setDate(currentEndDate.getDate() + (i * 7));

    let schedule = await WeeklySchedule.findOne({
      workshopId,
      startDate: currentStartDate,
      endDate: currentEndDate
    });

    if (!schedule) {
      schedule = new WeeklySchedule({
        workshopId,
        startDate: currentStartDate,
        endDate: currentEndDate
      });
      await schedule.save();
    }

    // Clear existing assignments for this schedule
    await ShiftAssignment.deleteMany({ scheduleId: schedule._id });

    if (assignments && assignments.length > 0) {
      const newAssignments = assignments.map(a => {
        const aDate = new Date(a.date);
        aDate.setDate(aDate.getDate() + (i * 7));
        const yyyy = aDate.getFullYear();
        const mm = String(aDate.getMonth() + 1).padStart(2, '0');
        const dd = String(aDate.getDate()).padStart(2, '0');

        return {
          scheduleId: schedule._id,
          workshopId,
          shiftTemplateId: a.shiftTemplateId,
          staffId: a.staffId,
          date: `${yyyy}-${mm}-${dd}`,
          status: 'assigned',
          assignedBy
        };
      });
      await ShiftAssignment.insertMany(newAssignments);
    }
  }

  return { success: true };
};
