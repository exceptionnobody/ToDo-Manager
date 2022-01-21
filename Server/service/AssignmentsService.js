'use strict';

const Task = require('../components/task');
const User = require('../components/user');
const db = require('../components/db');
var WSMessage = require('../components/ws_message.js');
var WebSocket = require('../components/websocket');
const mqtt = require('../components/mqtt');
const MQTTTaskMessage = require('../components/mqtt_task_message.js');

/**
 * Assign a user to the task
 *
 *
 * Input: 
 * - userId : ID of the task assignee
 * - taskId: ID of the task to be assigned
 * - owner: ID of the user who wants to assign the task
 * Output:
 * - no response expected for this operation
 * 
 **/
exports.assignTaskToUser = function(userId,taskId,owner) {
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
                const sql2 = 'INSERT INTO assignments(task, user) VALUES(?,?)';
                db.run(sql2, [taskId, userId], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(null);
                    }
                });
            }
        });
    });
}


/**
 * Retreve the users assignted to the task
 *
 * Input: 
 * - taskId: ID of the task
 * - owner: ID of the user who wants to retrieve the list of assignees
 * Output:
 * - list of assignees
 * 
 **/
exports.getUsersAssigned = function(taskId,owner) {
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
                const sql2 = "SELECT u.id as uid, u.name, u.email FROM assignments as a, users as u WHERE  a.task = ? AND a.user = u.id";
                db.all(sql2, [taskId], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        let users = rows.map((row) => new User(row.uid, row.name, row.email, null));
                        resolve(users);
                    }
                });
            }
        });
    });
}


/**
 * Remove a user from the assigned task
 *
 * Input: 
 * - taskId: ID of the task
 * - userId: ID of the assignee
 * - owner : ID of user who wants to remove the assignee
 * Output:
 * - no response expected for this operation
 * 
 **/
exports.removeUser = function(taskId,userId,owner) {
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
                const sql2 = 'DELETE FROM assignments WHERE task = ? AND user = ?';
                db.run(sql2, [taskId, userId], (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve(null);
                })
            }
        });
    });

}


/**
 * Reassign tasks in a balanced manner
 *
 * Input: 
 * - owner : ID of user who wants to assign the tasks
 * Output:
 * - no response expected for this operation
 * 
 **/
 exports.assignBalanced = function(owner) {
    return new Promise((resolve, reject) => {
      const sql = "SELECT t1.id FROM tasks t1 LEFT JOIN assignments t2 ON t2.task = t1.id WHERE t1.owner = ? AND t2.task IS NULL";
      db.each(sql, [owner], (err, tasks) => {
          if (err) {
              reject(err);
          } else {
              exports.assignEach(tasks.id, owner).then(function(userid) {
                  resolve(userid);
              });
          }
      });
      resolve(null);
    });
  }


  
/**
 * Select a task as the active task
 *
 * Input: 
 * - userId: id of the user who wants to select the task
 * - taskId: ID of the task to be selected
 * Output:
 * - no response expected for this operation
 * 
 **/
exports.selectTask = function selectTask(userId, taskId) {
    return new Promise((resolve, reject) => {

        db.serialize(function() {  

            db.run('BEGIN TRANSACTION;');
            const sql1 = 'SELECT t.id FROM tasks as t WHERE t.id = ?';
            db.all(sql1, [taskId], function(err, check) {
                if (err) {
                    db.run('ROLLBACK;')
                    reject(err);
                } 
                else if (check.length == 0){
                    db.run('ROLLBACK;')
                    reject(404);
                } 
                else {
                    const sql2 = 'SELECT t.id FROM assignments as a, tasks as t WHERE a.user = ? AND a.task = t.id AND a.active = 1';
                    db.all(sql2, [userId], function(err, rows1) {
                        if (err) {
                            db.run('ROLLBACK;')
                            reject(err);
                        } else {
                            var deselected = null;
                            if(rows1.length !== 0) deselected = rows1[0].id;
                            const sql3 = 'SELECT u.name, t.description FROM assignments as a, users as u, tasks as t WHERE a.user = ? AND a.task = ? AND a.user = u.id AND a.task = t.id';
                            db.all(sql3, [userId, taskId], function(err, rows2) {
                                if (err) {
                                    db.run('ROLLBACK;')
                                    reject(err);
                                } else {
                                    const sql4 = 'UPDATE assignments SET active = 0 WHERE user = ?';
                                    db.run(sql4, [userId], function(err) {
                                        if (err) {
                                            db.run('ROLLBACK;')
                                            reject(err);
                                        } else {
                                            const sql5 = 'UPDATE assignments SET active = 1 WHERE user = ? AND task = ? AND NOT EXISTS (SELECT * FROM assignments WHERE user <> ? AND task = ? AND active = 1)';
                                            db.run(sql5, [userId, taskId, userId, taskId], function(err) {
                                                if (err) {
                                                    db.run('ROLLBACK;')
                                                    reject(err);
                                                } else if (this.changes == 0) {
                                                    db.run('ROLLBACK;')
                                                    reject(403);
                                                } else {
                                                            db.run('COMMIT TRANSACTION');

                                                            //publish the MQTT message for the selected task
                                                            var message = new MQTTTaskMessage("active", parseInt(userId), rows2[0].name);
                                                            mqtt.saveMessage(taskId, message);
                                                            mqtt.publishTaskMessage(taskId, message);

                                                            //publish the MQTT message for the selected task
                                                            if(deselected){
                                                                var message = new MQTTTaskMessage("inactive", null, null);
                                                                mqtt.saveMessage(deselected, message);
                                                                mqtt.publishTaskMessage(deselected, message);
                                                            }

                                                            //inform the clients that the user selected a different task where they are working on
                                                            var updateMessage = new WSMessage('update', parseInt(userId), rows2[0].name, parseInt(taskId), rows2[0].description);
                                                            WebSocket.sendAllClients(updateMessage);
                                                            WebSocket.saveMessage(userId, new WSMessage('login', parseInt(userId), rows2[0].name, parseInt(taskId), rows2[0].description));
                                                
                                                            resolve();
                                                        
                                                    }
                                                })
                                            }
                                        });
                                }
                            });
                        }
                    });
                }
            })
        });
    });
}


/**
 * Utility functions
 */
 exports.getTaskSelections = function getTaskSelections() {
    return new Promise((resolve, reject) => {
        const sql = "SELECT t.id as taskId, u.id as userId, u.name as userName FROM tasks as t LEFT JOIN assignments as a ON t.id = a.task AND active = 1 LEFT JOIN users u ON u.id = a.user";
        db.all(sql, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
      });
}

exports.assignEach = function(taskId, owner) {
  return new Promise((resolve, reject) => {
      const sql = "SELECT user, MIN(Count) as MinVal FROM (SELECT user,COUNT(*) as Count FROM assignments GROUP BY user) T";
      var user = null;
      db.get(sql, (err, user) => {
          if (err) {
              reject(err);
          } else {
              exports.assignTaskToUser(user.user, taskId, owner).then(resolve(user.user));
          }
      });
  });
}