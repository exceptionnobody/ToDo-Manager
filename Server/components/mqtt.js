'use strict'

var mqtt = require('mqtt');
var Assignments = require('../service/AssignmentsService');
var Tasks = require('../service/TasksService.js');
var MQTTTaskMessage = require('./mqtt_task_message.js');
var MQTTAllPublicTaskMessage = require('./mqtt_all_public_task.js');

var host = 'ws://localhost:8080';
var clientId = 'mqttjs_server' + Math.random().toString(16).substr(2, 8);
var options = {
  keepalive: 30,
  clientId: clientId,
  clean: true,
  reconnectPeriod: 60000,
  connectTimeout: 30*1000,
  will: {
    topic: 'WillMsg',
    payload: 'Connection Closed abnormally..!',
    qos: 0,
    retain: false
  },
  rejectUnauthorized: false
};
var mqtt_connection = mqtt.connect(host, options);

var taskMessageMap = new Map();
var publicTasksList = new Map();


mqtt_connection.on('error', function (err) {
  console.log(err)
  mqtt_connection.end()
})

//When the connection with the MQTT broker is established, a retained message for each task is sent
mqtt_connection.on('connect', function () {
  console.log('client connected:' + clientId)

  Assignments.getTaskSelections().then(function (selections) {
    selections.forEach(function(selection){
      var status = (selection.userId) ? "active" : "inactive";
      var message = new MQTTTaskMessage(status, selection.userId, selection.userName);
      taskMessageMap.set(selection.taskId, message);
      mqtt_connection.publish(String(selection.taskId), JSON.stringify(message), { qos: 0, retain: true });
    });
  }) .catch(function (error) {
    mqtt_connection.end();
  });

  Tasks.retriveAllPublicTasksIds().then(function(response) {

    console.log("Response: ", response)
    if(response.numberPublicTasksId){
      
      for(const item of response.publicTasksIds)
          if(!publicTasksList.has(item) ){
              publicTasksList.set(item)
          }
      
    }
    mqtt_connection.publish("RecoveryPublicTasks",JSON.stringify(new MQTTAllPublicTaskMessage("allPublicTasks", [...publicTasksList.keys()].length, [...publicTasksList.keys()])), {qos:0, retain:true})
   
  })
})

mqtt_connection.on('close', function () {
  console.log(clientId + ' disconnected');
})

module.exports.publishTaskMessage = function publishTaskMessage(taskId, message, retain) {
  //settare retain = true
    if(retain)
      mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:false})
    else
      mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:true})

};

module.exports.publishPublicTaskMessage = function publishPublicTaskMessage(message) {
  mqtt_connection.publish("PublicTasks", JSON.stringify(message), { qos: 0 })
};

module.exports.addPublishPublicTaskMessage = function addPublishPublicTaskMessage(taskId) {
  
  publicTasksList.set(parseInt(taskId))
  console.log("ADD A TASK: PUBLICKTASKLIST: ", [...publicTasksList.keys()], "SIZEPUBLICTASKS: ", [...publicTasksList.keys()].length)
  mqtt_connection.publish("RecoveryPublicTasks",JSON.stringify(new MQTTAllPublicTaskMessage("allPublicTasks", [...publicTasksList.keys()].length, [...publicTasksList.keys()])), {qos:0, retain:true})
};

module.exports.deletePublishPublicTaskMessage = function deletePublishPublicTaskMessage(taskId) {
  
  publicTasksList.delete(parseInt(taskId))
  console.log("ADD A TASK: PUBLICKTASKLIST: ", [...publicTasksList.keys()], "SIZEPUBLICTASKS: ", [...publicTasksList.keys()].length)
  mqtt_connection.publish("RecoveryPublicTasks",JSON.stringify(new MQTTAllPublicTaskMessage("allPublicTasks", [...publicTasksList.keys()].length, [...publicTasksList.keys()])), {qos:0, retain:true})
};

module.exports.saveMessage = function saveMessage(taskId, message) {
    taskMessageMap.set(taskId, message);
};

module.exports.getMessage = function getMessage(taskId) {
    taskMessageMap.get(taskId);
};

module.exports.deleteMessage = function deleteMessage(taskId) {
    taskMessageMap.delete(taskId);
};