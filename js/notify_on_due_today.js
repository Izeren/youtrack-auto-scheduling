/**
 * This rule runs every morning and notifies the user about issues that are due today.
 */

const entities = require('@jetbrains/youtrack-scripting-api/entities');

exports.rule = entities.Issue.onSchedule({
    title: 'Notify user about issues that are due today',
    //
    search: '#Unresolved Due date: Today [Partial]',
    cron: '0 0 5 * * ?',
    // We don't want to send any extra notifications  to the user, so we set this to true
    muteUpdateNotifications: true,
    // This workflow doesn't modify any properties, so we set this to false
    modifyUpdatedProperties: false,
    guard: function(ctx) {
        return true;
    },
    action: (ctx) => {
        try {
            ctx.issue.fields.Assignee.notify(`Task is scheduled for today: ${ctx.issue.summary}`,
                `Issue link: https://izeren.youtrack.cloud/issue/${ctx.issue.id}\n
                Issue planned time slot: ${new Date(ctx.issue.fields['Start date'])}, 
                ${new Date(ctx.issue.fields['Due date'])}`);

            // Send a consolidated email to the assignee of each issue
        } catch (error) {
            ctx.debug_issue.addComment(`Workflow Exception: ${error.message}`, ctx.currentUser);
        }
    },
    requirements: {
        debug_issue: {
            type: entities.Issue,
            id: 'izeren-1032'
        }
    }
});