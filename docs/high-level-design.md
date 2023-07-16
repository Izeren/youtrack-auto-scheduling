# Youtrack automated task scheduler design

Purpose of this feature is to provide reasonable automation for planning stories with long estimation with flexible schedules

## Functional requirements:

1. Each story task should have an estimate of total time.
2. Subtasks should be created dynamically for each story, based on an on-demand event or a regular time trigger. The number of subtasks created should cover the next 2-4 weeks.
3. Subtasks should be automatically scheduled within a certain time frame based on the schedule associated with their parent story.
4. The schedule for each task could be stored in a separate label story that contains metadata in cron format in the description.
5. The scheduler should take into account the priority of the story. For stories with the same priority, sorting should be done by name to make the process deterministic.
6. The scheduler should be able to split the story into chunks of a minimum size defined by labels.
7. If a task is not completed as per schedule, a comment should be logged in the story and the subtask should be deleted.
8. If the schedule or the minimum chunk size is updated, all existing subtasks for that story should be deleted and new subtasks should be created according to the updated parameters.
9. The total time for all subtasks should not exceed the remaining time for the parent story. Once the total completed time for a story reaches its total estimated time, the story should be marked as complete and removed from the schedule.


## Following design will cover the following components of solution:
1. Schedules management
2. Dynamic subtask creation


### Schedules management:

Each schedule should have unique label mapped 1 to 1. To store metadata for schedule, special task is to be created. This task has generic "schedule" label and "custom_schedule" label. This way it is easy to find and manage all schedule tasks by generic label. And 1 to 1 mapping is maintained. Each schedule task has mapping {'Mon': "12:00-13:00,18:00-17:30", 'Tue':...} as the first line, describing time slots over the week (no bi-weekly schedule at this point, for recurring task, creation can be automated with separate rule). Other lines of description can contain user comments for this schedule. All stories marked as general schedule should be validated on save:

JSON example of time schedule:
``` 
{'Mon': "12:00-13:00,18:00-17:30", 'Tue':...}
``` 
Validation checks to be performed for successful update:
1. Schedule json in description is parseable, parsed schedule is legit and doesn't have inner conflicts
2. unique label is assigned for custom schedule (this label should end with "schedule")
3. other custom schedules have no intersection (all schedules shouldn't overlap, this is current design limitation)

In case of failed validation, 'custom_schedule' label should be removed from task, task should be commented or marked as failed validation.

### Dynamic subtask creation:

There are various potential triggers to be considered that have dedicated blast radius, hence design for this component will be split into trigger use cases

each use case will have the following structure:

Trigger type: event/schedule
Blast radius: resources to be updated
Resulting changes: changes to be applied

There are following triggers considered:
* New story creation with auto-schedule label
* auto-schedule label is added to story
* schedule task has been modified
* manual workflow trigger
* subtask of auto-schedule was complete
* daily to reschedule missed subtask


To simplify explanation of use cases below, please check these workflow step references:

`story reschedule`: common list of steps to recreate subtasks and reallocate slots for particular story
* Delete all open subtasks related to story
* analyse time left before completion
* timeslots are parsed from associated schedule
* subtasks created for timeslots with greedy algorithm that follows rules
  * Each subtask should be not less than min chunk (defined by dedicated label)
  * Each subtask should be not more than 1h30m without breaks (such big tasks require at least 20min break)
  * Each subtask planned for a certain slot should have start time and due time
* If no subtasks can be scheduled than failure should be logged on main story with details

`incremental schedule`: for cases when subtask was complete or due date failed
* Get total estimate for story minus total completed time
* Get total scheduled time for this story (from existing open subtasks)
* Get total unscheduled time for the story
* If this time is not zero try schedule subtasks for this story using 2-4 week horizon and taking into account already scheduled tasks (when searching for slots we should ban already allocated slots)

`custom_schedule refresh`: common list of steps to refresh allocation for certain schedule
* Stories with the same custom schedule are sorted by priority
* All open subtasks removed from all the stories with the corresponding schedule label
* `story reschedule` is triggered for selected story

#### New story creation with auto-schedule label
Trigger: event

Blast radius: all stories with the same custom schedule label

Resulting changes:
* `custom_schedule refresh`

#### auto-schedule label is added to story
Trigger: event

Blast Radius: all stories with the same custom schedule label

Resulting Changes:
* `custom_schedule refresh`

#### schedule task has been modified
Trigger: event

Blast Radius: all stories with the modified schedule

Resulting Changes:
* `custom_schedule refresh`

#### manual workflow trigger
Trigger: event

Blast Radius: all stories with the auto-schedule label

Resulting Changes:
* All schedule tasks are modified with comment or no-op change
* As result `custom_schedule refresh` triggered for all custom schedule labels

#### subtask of auto-schedule was complete
Trigger: event

Blast Radius: the parent story of the completed subtask and other stories with the same schedule label

Resulting Changes:

* The parent story's completed time is updated (it is updated with time logged on subtask, important note that time logged on subtask can differ from scheduled estimate, but it doesn't impact total story estimate, we mark for completion the same amount as on subtask [but it does impact further scheduling])
* If the parent story's total estimated time is reached, the story is marked as complete and removed from the schedule
* `incremental schedule`

#### daily to reschedule missed subtask
Trigger: schedule (daily)

Blast Radius: all stories with the auto-schedule label that have subtasks past their due date

Resulting Changes:

* Past-due subtasks are deleted and a comment is logged in the parent story
* Notification email is sent listing tasks with failed due date to be rescheduled
* `incremental schedule` applied for every story with open subtasks with failed due date


## Appendix

### Further points to consider

A few further points to consider:

1. Scheduling Algorithm: The document doesn't detail how the scheduling algorithm will work. Specifically, how does it decide where to place each subtask within the available time slots? Is it a simple first-fit algorithm, or does it take other factors into consideration? 
2. Edge Cases: Consider what happens when a task is completed earlier than expected, or if a task is deleted. Should the scheduler try to move up subsequent tasks, or leave the schedule as is? What if a task is added that has a higher priority than existing tasks? 
3. Performance: Depending on the number of tasks and the complexity of the schedules, the scheduling process could potentially be quite slow. It might be worth considering how the system could be optimized for performance, or how it could provide feedback to the user if scheduling is taking a long time. 
4. User Experience: Consider how the system will provide feedback to the user. For example, if a schedule is invalid or if tasks can't be scheduled, how will the user be notified? How can the user easily see which tasks are scheduled for each day?

### Rough taskification

#### Task 1: Setup and Preparation
Description: Set up your development environment, familiarize yourself with YouTrack's Workflow API, and outline the main components of your implementation based on your design document.

Estimate: 1-2 hours

#### Task 2: Implement Schedule Management
Description: Implement the functionality for managing schedules, including creating a new schedule task, parsing the schedule from the task description, and validating the schedule format and overlaps.

Subtasks:

Task 2.1: Implement schedule task creation (1-2 hours)
Task 2.2: Implement schedule parsing (1-2 hours)
Task 2.3: Implement schedule validation (1-2 hours)
Estimate: 3-6 hours total

#### Task 3: Implement Dynamic Subtask Creation
Description: Implement the functionality for creating subtasks dynamically based on various triggers. This includes the story reschedule, incremental schedule, and custom_schedule refresh workflows.

Subtasks:

Task 3.1: Implement story reschedule workflow (2-3 hours)
Task 3.2: Implement incremental schedule workflow (2-3 hours)
Task 3.3: Implement custom_schedule refresh workflow (2-3 hours)
Task 3.4: Implement triggers for creating subtasks (2-3 hours)
Estimate: 8-12 hours total

#### Task 4: Implement Missed Subtask Handling
Description: Implement the functionality for handling missed subtasks, including deleting past-due subtasks, logging a comment in the parent story, and sending a notification email.

Estimate: 1-2 hours

#### Task 5: Testing
Description: Test the workflow with a variety of different stories and schedules to ensure it behaves as expected.

Estimate: 3-5 hours

#### Task 6: Debugging and Refinement
Description: Based on the results of testing, debug any issues and make any necessary improvements or refinements to the workflow.

Estimate: 3-5 hours