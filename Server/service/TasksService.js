'use strict';

const Task = require('../components/task');
const db = require('../components/db');
var constants = require('../utils/constants.js');
const mqtt = require('../components/mqtt');
const MQTTTaskMessage = require('../components/mqtt_task_message.js');
const MQTTForPublicChannel = require('../components/mqtt_public_task_message.js');
var message;
var pageNo, size;

/**
 * Create a new task
 *
 * Input: 
 * - task: the task object that needs to be created
 * - owner: ID of the user who is creating the task
 * Output:
 * - the created task
 **/
exports.addTask = function(task, owner) {
    return new Promise((resolve, reject) => {
        const sql = 'INSERT INTO tasks(description, important, private, project, deadline, completed, owner) VALUES(?,?,?,?,?,?, ?)';
        db.run(sql, [task.description, task.important, task.private, task.project, task.deadline, task.completed, owner], function(err) {
            if (err) {
                reject(err);
            } else {
                if(!task.private){
                    let createdPubTask = new Task(this.lastID, task.description, task.important, task.private, task.deadline, task.project, task.completed);
                    console.log("Task Created: ", createdPubTask)
                    let mess = new MQTTTaskMessage("insert",null,null,createdPubTask)
                    mqtt.publishTaskMessage(this.lastID, mess, true)
                    mqtt.publishPublicTaskMessage(new MQTTForPublicChannel("subscribe", this.lastID));
                    
                    resolve(null);
                   
                 } else{
                //Creation of a new private task and I sent a MQTT message for the created task
                var message = new MQTTTaskMessage("inactive");
                mqtt.saveMessage(this.lastID, message);
                mqtt.publishTaskMessage(this.lastID, message);

                var createdTask = new Task(this.lastID, task.description, task.important, task.private, task.deadline, task.project, task.completed, task.active);
                resolve(createdTask);
            }
            }

        });
    });
}


/**
 * Delete a task having taskId as ID
 *
 * Input: 
 * - taskId: the ID of the task that needs to be deleted
 * - owner: ID of the user who is creating the task
 * Output:
 * - no response expected for this operation
 **/
exports.deleteTask = function(taskId, owner) {
    return new Promise((resolve, reject) => {
        const sql1 = "SELECT owner, private FROM tasks t WHERE t.id = ?";
        db.all(sql1, [taskId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else if(owner != rows[0].owner) {
                reject(403);
            }
            else {
                const sql2 = 'DELETE FROM assignments WHERE task = ?';
                db.run(sql2, [taskId], (err) => {
                    if (err)
                        reject(err);
                    else {
                        const sql3 = 'DELETE FROM tasks WHERE id = ?';
                        db.run(sql3, [taskId], (err) => {
                            if (err)
                                reject(err);
                            else{
                                    //Delete the private task with the corresponding MQTT message
                                    mqtt.publishTaskMessage(taskId, new MQTTTaskMessage("deleted"), false);
                                    //mqtt.publishTaskMessage(taskId, null); //uncomment if we want to clear the last retained message
                                    mqtt.deleteMessage(taskId);
                                   
                                resolve(null);
                            }
                        })
                    }
                })
            }
        });
    });
}


/**
 * Retrieve the public tasks
 * 
 * Input: 
 * - req: the request of the user
 * Output:
 * - list of the public tasks
 * 
 **/
exports.getPublicTasks = function(req) {
    return new Promise((resolve, reject) => {

        let sql = "SELECT t.id as tid, t.description, t.important, t.private, t.project, t.deadline,t.completed,c.total_rows FROM tasks t, (SELECT count(*) total_rows FROM tasks l WHERE l.private=0) c WHERE  t.private = 0 "
        let limits = getPagination(req);
        if (limits.length != 0) sql = sql + " LIMIT ?,?";
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                let tasks = rows.map((row) => createTask(row));
                resolve(tasks);
            }
        });
    });
}

module.exports.internalGetPublicTasks = function internalGetPublicTasks(req) {
    return new Promise((resolve, reject) => {

        let sql = "SELECT t.id as tid, t.description, t.important, t.private, t.project, t.deadline,t.completed FROM tasks t WHERE  t.private = 0 "
        
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                let tasks = rows.map((row) => createTask(row));
                resolve(tasks);
            }
        });
    });
}



/**
 * Retrieve the number of public tasks
 * 
 * Input: 
 * - none
 * Output:
 * - total number of public tasks
 * 
 **/
exports.getPublicTasksTotal = function() {
    return new Promise((resolve, reject) => {
        var sqlNumOfTasks = "SELECT count(*) total FROM tasks t WHERE  t.private = 0 ";
        db.get(sqlNumOfTasks, [], (err, size) => {
            if (err) {
                reject(err);
            } else {
                resolve(size.total);
            }
        });
    });
}


/**
 * Retrieve the task having taskId as ID
 *
 * Input: 
 * - taskId: the ID of the task that needs to be retrieved
 * - owner: ID of the user who is retrieving the task
 * Output:
 * - the requested task
 * 
 **/
exports.getSingleTask = function(taskId,owner) {
    return new Promise((resolve, reject) => {
        const sql1 = "SELECT id as tid, description, important, private, project, deadline, completed, owner FROM tasks WHERE id = ?";
        db.all(sql1, [taskId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else if (rows[0].owner == owner){
                var task = createTask(rows[0]);
                resolve(task);
            }
            else{
                const sql2 = "SELECT t.id as total FROM tasks as t, assignments as a WHERE t.id = a.task AND t.id = ? AND a.user = ? ";
                db.all(sql2, [taskId, owner], (err, rows2) => {
                    if(rows2.length === 0){
                        reject(403);
                    }
                    else{
                        var task = createTask(rows[0]);
                        resolve(task);
                    }
                });
            }
        });
    });
}


/**
 * Retreve the tasks created by the user
 * 
 * Input: 
 * -req: the request of the user
 * Output:
 * - the list of owned tasks
 * 
 **/
 exports.getOwnedTasks = function(req) {
    return new Promise((resolve, reject) => {
        var sql =  "SELECT t.id as tid, t.description, t.important, t.private, t.project, t.deadline,t.completed FROM tasks as t WHERE t.owner = ?";
        var limits = getPagination(req);
        if (limits.length != 0) sql = sql + " LIMIT ?,?";
        limits.unshift(req.user);

        db.all(sql, limits, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                let tasks = rows.map((row) => createTask(row));
                resolve(tasks);
            }
        });
    });
}



/**
 * Retreve the tasks assigned to the user
 * 
 * Input: 
 * - req: the request of the user
 * Output:
 * - the list of assigned tasks
 * 
 **/
exports.getAssignedTasks = function(req) {
    return new Promise((resolve, reject) => {
        var sql =  "SELECT t.id as tid, t.description, t.important, t.private, t.project, t.deadline,t.completed,a.active, u.id as uid, u.name, u.email FROM tasks as t, users as u, assignments as a WHERE t.id = a.task AND a.user = u.id AND u.id = ?";
        var limits = getPagination(req);
        if (limits.length != 0) sql = sql + " LIMIT ?,?";
        limits.unshift(req.user);

        db.all(sql, limits, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                let tasks = rows.map((row) => createTask(row));
                resolve(tasks);
            }
        });
    });
}


/**
 * Retrieve the number of owned tasks
 * 
 * Input: 
 * - req: the request of the user
 * Output:
 * - total number of owned tasks
 * 
 **/
exports.getOwnedTasksTotal = function(req) {
    return new Promise((resolve, reject) => {
        var sqlNumOfTasks = "SELECT count(*) total FROM tasks as t WHERE t.owner = ?";
        db.get(sqlNumOfTasks, req.user, (err, size) => {
            if (err) {
                reject(err);
            } else {
                resolve(size.total);
            }
        });
    });
}

/**
 * Retrieve the number of assigned tasks
 * 
 * Input: 
 * - req: the request of the user
 * Output:
 * - total number of assigned tasks
 * 
 **/
exports.getAssignedTasksTotal = function(req) {
    return new Promise((resolve, reject) => {
        var sqlNumOfTasks = "SELECT count(*) total FROM tasks as t, users as u, assignments as a WHERE t.id = a.task AND a.user = u.id AND u.id = ?";
        db.get(sqlNumOfTasks, req.user, (err, size) => {
            if (err) {
                reject(err);
            } else {
                resolve(size.total);
            }
        });
    });
}


/**
 * Update a task
 *
 * Input:
 * - task: new task object
 * - taskID: the ID of the task to be updated
 * - owner: the ID of the user who wants to update the task
 * Output:
 * - no response expected for this operation
 * 
 **/
exports.updateSingleTask = function(task, taskId, owner) {
    return new Promise((resolve, reject) => {

        const sql1 = "SELECT owner FROM tasks t WHERE t.id = ?";
        db.all(sql1, [taskId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else if(owner != rows[0].owner) {
                reject(403);
            }
            else {
                const sql2 = 'DELETE FROM assignments WHERE task = ?';
                db.run(sql2, [taskId], (err) => {
                    if (err)
                        reject(err);
                    else {
                        var sql3 = 'UPDATE tasks SET description = ?';
                        var parameters = [task.description];
                        if(task.important != undefined){
                            sql3 = sql3.concat(', important = ?');
                            parameters.push(task.important);
                        } 
                        if(task.private != undefined){
                            sql3 = sql3.concat(', private = ?');
                            parameters.push(task.private);
                        } 
                        if(task.project != undefined){
                            sql3 = sql3.concat(', project = ?');
                            parameters.push(task.project);
                        } 
                        if(task.deadline != undefined){
                            sql3 = sql3.concat(', deadline = ?');
                            parameters.push(task.deadline);
                        } 
                        sql3 = sql3.concat(' WHERE id = ?');
                        parameters.push(task.id);

                        db.run(sql3, parameters, function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(null);
                            }

                        })
                    }
                })
            }
        });
    });
}


exports.updateSingleTask2 = function (task, taskId, owner) {
    return new Promise((resolve, reject) => {

        const sql1 = "SELECT owner, private, u.name FROM tasks t, users u WHERE t.id = ? AND u.id = ?";
        db.all(sql1, [taskId, owner], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else if (owner != rows[0].owner) {
                reject(403);
            }
            else {
                const sql2 = 'DELETE FROM assignments WHERE task = ?';
                db.run(sql2, [taskId], (err) => {
                    if (err)
                        reject(err);
                    else {
                        var sql3 = 'UPDATE tasks SET description = ?';
                        var parameters = [task.description];
                        if (task.important != undefined) {
                            sql3 = sql3.concat(', important = ?');
                            parameters.push(task.important);
                        }
                        if (task.private != undefined) {
                            sql3 = sql3.concat(', private = ?');
                            parameters.push(task.private);
                        }
                        if (task.project != undefined) {
                            sql3 = sql3.concat(', project = ?');
                            parameters.push(task.project);
                        }
                        if (task.deadline != undefined) {
                            sql3 = sql3.concat(', deadline = ?');
                            parameters.push(task.deadline);
                        }
                        sql3 = sql3.concat(' WHERE id = ?');
                        parameters.push(task.id);

                        db.run(sql3, parameters, function (err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(null);
                                if(!rows[0].private && !task.private){ 
                                    // row[0].private == 0 && tas.private == false
                                    // vecchio task pubblico, nuovo task pubblico
                                    // pubblico il nuovo task nel suo topic
                                    message = new MQTTTaskMessage("update", null, null, task);
                                    mqtt.publishTaskMessage(taskId, message, true);
                                    //mqtt.publishTaskMessage(taskId, null);
                                }else if(rows[0].private == 1  && task.private) { 
                                    //row[0].private != 0 && tas.private == false
                                    // vecchio task privato e nuovo task privato
                                    // pubblico il nuovo task nel suo topic
                                    /*task.private = 1;
                                    task.completed = task.completed?1:0;
                                    task.important = task.important?1:0;
                                    message = new MQTTTaskMessage("update", owner, rows[0].name, task);
                                    
                                    mqtt.saveMessage(taskId, message);
                                    mqtt.publishTaskMessage(taskId, message,true);
                                    */
                                }else if(rows[0].private==1  && !task.private ){
                                    //row[0].private != 0 && tas.private == false
                                    // vecchio task privato, nuovo task pubblico
                                    // pubblico il nuovo task nel topic PublicTasks
                                    message = new MQTTForPublicChannel("subscribe", taskId);
                                    let message2 = new MQTTTaskMessage("insert", null, null, task)
                                    mqtt.publishTaskMessage(taskId, message2, true);
                                    mqtt.publishPublicTaskMessage(message);
                                    
                                    
                                }else{ 
                                    // row[0].private == 0 && task.private != false
                                    // vecchio task pubblico e nuovo task privato
                                    // pubblico il nuovo task nel suo topic
                                    message = new MQTTTaskMessage("changed");
                                    mqtt.publishTaskMessage(taskId, message, true);
                                    console.log("DA TASK PUBBLICO A TASK PRIVATO CON ID: ", taskId)
                                    
                                }
                            }

                        })
                    }
                })
            }
        });
    });
}



/**
 * Complete a task 
 *
 * Input:
 * - taskID: the ID of the task to be completed
 * - assignee: the ID of the user who wants to complete the task
 * Output:
 * - no response expected for this operation
 * 
 **/
 exports.completeTask = function(taskId, assignee) {
    return new Promise((resolve, reject) => {
        const sql1 = "SELECT * FROM tasks t WHERE t.id = ?";
        db.all(sql1, [taskId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else {
                const sql2 = "SELECT * FROM assignments a WHERE a.user = ? AND a.task = ?";
                db.all(sql2, [assignee, taskId], (err, rows2) => {
                    if (err)
                        reject(err);
                    else if (rows2.length === 0)
                        reject(403);
                    else {
                        const sql3 = 'UPDATE tasks SET completed = 1 WHERE id = ?';
                        db.run(sql3, [taskId], function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(null);
                            }
                        })
                    }
                })
            } 
            
        });
    });
}

/**
 * Utility functions
 */
const getPagination = function(req) {
    pageNo = parseInt(req.query.pageNo);
    size = constants.OFFSET;
    let limits = [];
    if (req.query.pageNo == null) {
        pageNo = 1;
    }
    limits.push(size * (pageNo - 1));
    limits.push(size);
    return limits;
}

const createTask = function(row) {
    const importantTask = (row.important === 1) ? true : false;
    const privateTask = (row.private === 1) ? true : false;
    const completedTask = (row.completed === 1) ? true : false;
    return new Task(row.tid, row.description, importantTask, privateTask, row.deadline, row.project, completedTask, row.active);
   
    }

