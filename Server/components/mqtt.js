'use strict'

var mqtt = require('mqtt');
var Assignments = require('../service/AssignmentsService');
var Tasks = require('../service/TasksService.js');
var MQTTTaskMessage = require('./mqtt_task_message.js');
var MQTTAllPublicIdTasksMessage = require('./mqtt_all_public_id_tasks');

// TEST
var fs = require("fs");
var path = require('path');
const Ajv = require("ajv")
const ajv = new Ajv({allErrors: true})
var mqttAllPublicIdTasksSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/mqtt_all_pubblic_id_tasks.json')).toString());

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

const validate = ajv.compile(mqttAllPublicIdTasksSchema) 


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

      mqtt_connection.publish(String(selection.taskId), JSON.stringify(message), {qos:0});
      
    });
    
    mqtt_connection.subscribe("TalkWithServer", {qos:0, retain: false})
  }) .catch(function (error) {
    mqtt_connection.end();
  })
 
})

mqtt_connection.on('close', function () {
  console.log(clientId + ' disconnected');
})


mqtt_connection.on('message', function (topic, message) {
  var parsedMessage = JSON.parse(message);
  if(topic == "TalkWithServer"){
    console.log("topic", topic)
    console.log("message", parsedMessage)
    if(parsedMessage.status == "getPublicTasks"){
      Tasks.getPublicTasksWithNoLimit().then(function(response){
        response.forEach(function(singleTask){
          //mqtt_connection.publish(String(singleTask.id), JSON.stringify(new MQTTTaskMessage("publicInitial", null, null, singleTask)), {qos:0, retain:true})  
          mqtt_connection.publish(String(singleTask.id), JSON.stringify(new MQTTTaskMessage("insert", null, null, singleTask)), {qos:0, retain:true})
        })

          let tempArray = response.map(x=>x.id).sort((a,b)=> a.id<b.id?-1:1)
          console.log("tempArray: ", tempArray)
          var message = new MQTTAllPublicIdTasksMessage("allPublicIdTasks", tempArray.length, tempArray)
          const valid = validate(message)
          if (valid) console.log("Valid To send!")
          else console.log("Invalid: " + ajv.errorsText(validate.errors))
  
          mqtt_connection.publish("GetPublicIdsTasks",JSON.stringify(message), {qos:0, retain:true})
         
    
    
      })
    }

  } 
})


module.exports.publishTaskMessage = function publishTaskMessage(taskId, message, myretain) {

  mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:myretain?myretain:true})

};

module.exports.publishPublicTaskMessage = function publishPublicTaskMessage(message) {
  mqtt_connection.publish("PublicTasks", JSON.stringify(message), { qos: 0, retain:false })
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


