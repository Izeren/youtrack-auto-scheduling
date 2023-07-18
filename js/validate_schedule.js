/* eslint-disable */
let entities = require('@jetbrains/youtrack-scripting-api/entities');
let workflow = require('@jetbrains/youtrack-scripting-api/workflow');

/**
 * A sample workflow that is triggered by update on issue with 'schedule' tag
 * To prevent unintentional triggers this workflow only triggered when issue has
 * tag: 'pending_update', this is to make schedule updates transactional.
 * This workflow removes tag `pending_update`.
 * For tasks with 'schedule' tag mandatory validation is performed by this workflow
 * Validation steps are the following:
 *
 * 1. Description of the story contains only JSON file that contains schedule
 * 2. This JSON doesn't have inner conflicts, all inner timeslots don't have overlaps
 * 3. TODO(not planned for early implementation, cross schedule conflicts are to be checked manually till then)
 * This workflow pulls descriptions from all `schedule` stories and verifies
 * no time slot overlaps to prevent task scheduling conflicts.
 */
exports.rule = entities.Issue.onChange({
    title: "Schedule validation",
    guard: function(ctx) {
        const logger = new Logger(ctx.traceEnabled);

        // --- #1 Issue.hasTag ---
        logger.log("Running scripts for the \"Issue has tag\" block");
        const schedule_story = ctx.issue;
        const schedule_tag = `schedule`;
        const update_tag= `pending_update`;

        const IssuehasTagsFn_0 = () => {
            if (schedule_story === null || schedule_story === undefined) throw new Error('Block #1 (Issue has tag): "Issue" has no value');
            if (schedule_tag === null || schedule_tag === undefined) throw new Error('Block #1 (Issue has tag): "Tag" has no value');
            if (update_tag === null || update_tag === undefined) throw new Error('Block #1 (Issue has tag): "Tag" has no value');

            return schedule_story.hasTag(schedule_tag) && schedule_story.hasTag(update_tag);
        };

        try {
            return (
                IssuehasTagsFn_0()
            );
        } catch (err) {
            if (err?.message?.includes('has no value')) {
                logger.error('Failed to execute guard', err);
                return false;
            }
            throw err;
        }

    },
    action: function(ctx) {
        let issue = ctx.issue;
        const update_tag= `pending_update`;
        issue.removeTag(update_tag);
        const logger = new Logger(ctx.traceEnabled);

        let schedule;

        try {
            schedule = JSON.parse(issue.description);
        } catch (e) {
            issue.addComment('Invalid schedule format. Please provide a valid JSON object.', ctx.currentUser);
            return;
        }

        // Validate the schedule format
        if (!Array.isArray(schedule.schedule)) {
            issue.addComment('Invalid schedule format. The "schedule" property must be an array.', ctx.currentUser);
            return;
        }

        for (const day of schedule.schedule) {
            if (!Array.isArray(day.days) || !Array.isArray(day.slots)) {
                issue.addComment('Invalid schedule format. Each day must include "days" and "slots".', ctx.currentUser);
                return;
            }

            for (const slot of day.slots) {
                if (!/^([01]\\d|2[0-3]):([0-5]\\d)$/.test(slot.start_time) || !/^([01]\\d|2[0-3]):([0-5]\\d)$/.test(slot.end_time)) {
                    issue.addComment('Invalid schedule format. "start_time" and "end_time" must be in HH:MM format.', ctx.currentUser);
                    return;
                }

                // Validate that the slot is not longer than 90 minutes
                const slotDuration = calculateDuration(slot);
                if (slotDuration > 90) {
                    issue.addComment('Invalid schedule format. Each slot cannot be longer than 90 minutes.', ctx.currentUser);
                    return;
                }
            }

            // Validate that the slots do not overlap
            const sortedSlots = day.slots.sort((a, b) => a.start_time.localeCompare(b.start_time));
            for (let i = 1; i < sortedSlots.length; i++) {
                const currentSlotEnd = sortedSlots[i - 1].end_time;
                const nextSlotStart = sortedSlots[i].start_time;

                const slotDuration = calculateDuration(sortedSlots[i - 1]);
                const breakDuration = calculateBreakTime(slotDuration);

                const nextAllowedStart = addMinutes(currentSlotEnd, breakDuration);

                if (nextSlotStart < nextAllowedStart) {
                    issue.addComment(`Invalid schedule format. There must be a ${breakDuration} minute break after a ${slotDuration} minute slot.`, ctx.currentUser);
                    return;
                }
            }
        }
        issue.addComment('Schedule is valid, rescheduling tasks with new schedule', ctx.currentUser);
    }
});

function calculateDuration(slot) {
    const [startHours, startMinutes] = slot.start_time.split(":").map(Number);
    const [endHours, endMinutes] = slot.end_time.split(":").map(Number);

    const startInMinutes = startHours * 60 + startMinutes;
    const endInMinutes = endHours * 60 + endMinutes;

    return endInMinutes - startInMinutes;
}

function calculateBreakTime(slotDuration) {
    if (slotDuration <= 15) {
        return 5;
    } else if (slotDuration <= 40) {
        return 10;
    } else {
        return 20;
    }
}

function addMinutes(time, minutesToAdd) {
    const [hours, minutes] = time.split(":").map(Number);

    const totalMinutes = hours * 60 + minutes + minutesToAdd;

    const newHours = Math.floor(totalMinutes / 60);
    const newMinutes = totalMinutes % 60;

    return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

function Logger(useDebug = true) {
    return {
        log: (...args) => useDebug && console.log(...args),
        warn: (...args) => useDebug && console.warn(...args),
        error: (...args) => useDebug && console.error(...args)
    };
}
