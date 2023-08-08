/* eslint-disable */
let entities = require('@jetbrains/youtrack-scripting-api/entities');
let workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const dateTime = require('@jetbrains/youtrack-scripting-api/date-time');


exports.rule = entities.Issue.onChange({
    title: "Subtask Scheduling",
    guard: function(ctx) {
        const logger = new Logger(ctx.traceEnabled);

        // --- #1 Issue.hasTag ---
        logger.log("Running scripts for the \"Issue has tag\" block");
        const schedule_story = ctx.issue;
        const schedule_tag = `auto_schedule`;
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
        issue.removeTag('pending_update');
        try {
            // Identify the story with the highest priority for the assigned schedule
            // Replace `getHighestPriorityStory` with your actual implementation
            let highestPriorityStory = getHighestPriorityStory(issue);

            // Delete all open subtasks for this story that have zero logged effort
            // Replace `getOpenSubtasksWithZeroEffort` and `deleteSubtask` with your actual implementation
            deleteOpenSubtasks(highestPriorityStory);

            let slots = getAvailableSlots(highestPriorityStory, 14); // testing with 2 weeks
            createSubtasks(ctx, highestPriorityStory, slots);
            issue.addComment('Subtasks scheduled', ctx.currentUser);
        } catch (err) {
            issue.addComment('Failed to create subtasks: ' + err, ctx.currentUser);
        }
    }
});

function Logger(useDebug = true) {
    return {
        log: (...args) => useDebug && console.log(...args),
        warn: (...args) => useDebug && console.warn(...args),
        error: (...args) => useDebug && console.error(...args)
    };
}

function getHighestPriorityStory(issue) {

    // Working under assumption that story is a subtask of `schedule` story
    // const parent = issue.links['subtask of'].first();
    // if (parent === null || parent === undefined) {
    //     throw new Error("This story can't be scheduled because it's not a subtask of a `schedule` story");
    // }

    // temporarily assume that issue triggered reschedule is the most important
    // that is fair assumption for PoC working on manual triggers
    return issue;
}

function deleteOpenSubtasks(story) {
    const unresolvedSubtask = story.links['parent for'].forEach(
        function (subtask) {
            if (subtask.isReported && !(subtask.fields.State && subtask.fields.State.isResolved)) {
                subtask.applyCommand('delete');
            }
        }
    );
    if (unresolvedSubtask) {
        throw new Error("Failed to delete open subtasks, please remove them manually");
    }
}

function getAvailableSlots(story, horizon) {
    // Parse schedule from parent task description
    const parent = story.links['subtask of'].first();
    const schedule = JSON.parse(parent.description).schedule;

    // Get current time and time in 4 weeks
    const now = new Date();
    const fourWeeks = new Date(now.getTime() + horizon * 24 * 60 * 60 * 1000);

    // Get time slots from now to four weeks with given schedule
    const availableSlots = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let time = new Date(now.getTime()); time < fourWeeks; time.setDate(time.getDate() + 1)) {
        const dayName = dayNames[time.getDay()];

        for (let scheduleItem of schedule) {
            if (scheduleItem.days.includes(dayName)) {
                for (let slot of scheduleItem.slots) {
                    const startHoursMinutes = slot.start_time.split(':').map(Number);
                    const endHoursMinutes = slot.end_time.split(':').map(Number);

                    const slotStartTime = new Date(time.getFullYear(), time.getMonth(), time.getDate(), startHoursMinutes[0], startHoursMinutes[1]);
                    const slotEndTime = new Date(time.getFullYear(), time.getMonth(), time.getDate(), endHoursMinutes[0], endHoursMinutes[1]);

                    if (slotEndTime > now) {
                        // Only add slots that are in the future
                        availableSlots.push({
                            start_time: slotStartTime,
                            end_time: slotEndTime,
                            length: (slotEndTime.getTime() - slotStartTime.getTime()) / (60 * 1000)  // Length in minutes
                        });
                    }
                }
            }
        }
    }

    return availableSlots;
}



function formatDateTime(dateTime) {
    // Change this function if you prefer a different date/time format
    return dateTime.toLocaleString();
}

function logProposedSlots(ctx, issue) {
    let slots = getAvailableSlots(issue, 14);  // 2 weeks

    // Add a debugging comment with the proposed slots
    let slotsString = slots.map(slot => 'Start: ' + formatDateTime(slot.start_time) + ', End: ' + formatDateTime(slot.end_time) + ', Length: ' + slot.length + ' minutes').join('\n');
    issue.addComment('Proposed slots:\n' + slotsString, ctx.currentUser);
}

function periodToMinutes(period) {
    if (!period) return 0;
    return period.getMinutes() + 60 * (period.getHours() + 8 * (period.getDays() + 7 * period.getWeeks()));
}

function logEstimateAndEffort(ctx, issue) {
    // Get the estimate and effort durations in minutes
    let estimate = periodToMinutes(issue.fields.Estimate);
    let effort = periodToMinutes(issue.fields.Effort);


    // Add a debugging comment with the estimate and logged effort
    issue.addComment('Estimate: ' + estimate + ' minutes, Logged effort: ' + effort + ' minutes', ctx.currentUser);
}

function createSubtasks(ctx, issue, slots) {
    if (!issue) {
        throw new Error('createSubtasks was called with an undefined issue');
    }
    if (!issue.fields) {
        throw new Error('createSubtasks was called with an issue that has no fields');
    }

    let estimate = periodToMinutes(issue.fields.Estimate);
    let effort = periodToMinutes(issue.fields.Effort);
    let effortToSchedule = estimate - effort;

    // Create subtasks for each slot until we cover effort to schedule
    // or until we run out of slots
    for (let slot of slots) {
        if (effortToSchedule <= 0) {
            break;
        }

        // Determine the effort for this subtask
        let subtaskEffort = Math.min(slot.length, effortToSchedule);

        // Create a new subtask
        const newIssue = new entities.Issue(ctx.currentUser, issue.project, '[Partial]: ' + issue.summary);

        // newIssue.fields.Type = ctx.TypeEnum.Task;
        newIssue.links['subtask of'].add(issue);
        newIssue.fields.Estimate = dateTime.toPeriod(subtaskEffort * 60 * 1000);  // Convert minutes to milliseconds
        newIssue.fields['Due date'] = slot.end_time.getTime();
        newIssue.fields['Start date'] = slot.start_time.getTime();
        newIssue.fields.Assignee = ctx.currentUser;
        newIssue.addComment(
            'Subtask created for start time: ' + slot.start_time + ' and end time: ' + slot.end_time,
            ctx.currentUser);
        newIssue.applyCommand('add Board Daily routine')

        // Decrease the remaining effort to schedule
        effortToSchedule -= subtaskEffort;
    }
}