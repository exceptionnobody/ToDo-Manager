import { React, useState, useEffect } from 'react';

import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import API from './API'

import { Container, Row, Col, Button, Toast } from 'react-bootstrap/';


import Navigation from './components/Navigation';
import Filters from './components/Filters';
import ContentList from './components/ContentList';
import PublicList from './components/PublicList';
import ModalForm from './components/ModalForm';
import { LoginForm } from './components/Login';
import Assignments from './components/Assignments';
import OnlineList from './components/OnlineList';
import MiniOnlineList from './components/MiniOnlineList';

import { Route, useRouteMatch, useHistory, Switch, Redirect, BrowserRouter as Router } from 'react-router-dom';


import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';


dayjs.extend(isToday);

const EventEmitter = require('events');
const handler = new EventEmitter();

const url = 'ws://localhost:5000'
var ws = new WebSocket(url)

var mqtt = require('mqtt')
var clientId = 'mqttjs_' + Math.random().toString(16).substr(2, 8)
var options = {
  keepalive: 30,
  clientId: clientId,
  clean: true,
  reconnectPeriod: 1000,
  connectTimeout: 30 * 1000,
  will: {
    topic: 'WillMsg',
    payload: 'Connection Closed abnormally..!',
    qos: 0,
    retain: false
  },
  rejectUnauthorized: false
}
var host = 'ws://127.0.0.1:8080'
var client = mqtt.connect(host, options);
var PublicMap = new Map()
var OwnTasksMaps = new Map() 
var temp = []
var index;
var TestLista = new Map()

var constants = Object.freeze({
  OFFSET: 10,
});

const App = () => {

  // Need to place <Router> above the components that use router hooks
  return (
    <Router>
      <Main></Main>
    </Router>
  );

}

const Main = () => {

  // This state is an object containing the list of tasks, and the last used ID (necessary to create a new task that has a unique ID)
  const [taskList, setTaskList] = useState([]);
  const [OwnedTaskList, setOwnedTaskList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [onlineList, setOnlineList] = useState([]);
  const [assignedTaskList, setAssignedTaskList] = useState([]);
  const [dirty, setDirty] = useState(true);

  const MODAL = { CLOSED: -2, ADD: -1 };
  const [selectedTask, setSelectedTask] = useState(MODAL.CLOSED);

  const [message, setMessage] = useState('');

  const [loggedIn, setLoggedIn] = useState(false); // at the beginning, no user is logged in
  const [user, setUser] = useState(null);

  const [pubTasks, setPubTasks] = useState([])
  // active filter is read from the current url
  const match = useRouteMatch('/list/:filter');
  const activeFilter = (match && match.params && match.params.filter) ? match.params.filter : 'owned';

  const history = useHistory();
  // if another filter is selected, redirect to a new view/url
  const handleSelectFilter = (filter) => {
    history.push("/list/" + filter);
  }



  useEffect(() => {


    //MQTT management

    client.on('error', function (err) {
      console.log(err)
      client.end()
    })

    client.on('connect', function () {
      console.log('client connected:' + clientId)
    })


    client.on('message', function (topic, messageBroker) {
      try {
        var parsedMessage = JSON.parse(messageBroker);

        if (topic != "PublicTasks" && topic != "RecoveryPublicTasks" && topic != "CompletePublicTasks") {
          
          if (parsedMessage.status == "deleted"){
            client.unsubscribe(topic);
            displayTaskSelection(topic, parsedMessage);
          }
            

          if (parsedMessage.status == "active" || parsedMessage.status == "inactive")
             displayTaskSelection(topic, parsedMessage);
          
          // gestione dei singoli task pubblici

          if (parsedMessage.status == "removeFromPubTasks" || parsedMessage.status == "deletePubTask"){
              removeOrDeletePublicTasks(topic)
          }
          if (parsedMessage.status == "updatePublicTask" || parsedMessage.status == "updatePrivateTask"){
            aggiornaTasks(topic, parsedMessage);
            displayTaskSelection(topic, parsedMessage);
          }
          
          if (parsedMessage.status == "public"){
            PublicMap.set(parsedMessage.task.id, parsedMessage.task)
            client.subscribe(String(parsedMessage.task.id), {qos:0, retain:true})
          }

          if (parsedMessage.status == "insertPublicTask"){
            addPublicTask(parsedMessage.task)
            displayTaskSelection(topic, parsedMessage.task);

          }

        } else {

          // gestione dei canali 
          // Topic: PublicTasks per aggiornamenti di task da privati a pubblici e creazioni di tasks pubblici
          // Topic: RecoveryPublicTasks per il recupero di tutti i tasks pubblici quando un client si connette per la prima volta

          if(topic == "PublicTasks"){
            if (parsedMessage.status == "newPubTaskId" || parsedMessage.status == "createdPubTask")
              client.subscribe(String(parsedMessage.id), { qos: 0, retain: true })
              console.log("Messaggi PublicTasks: ", parsedMessage)
          }

          if(topic == "RecoveryPublicTasks"){
            if(parsedMessage.status == "allInitialPublicTasks"){
              console.log("Inizial Public Tasks")
              console.log(parsedMessage)
              
              let totalPublicPage= Math.ceil( parseInt(parsedMessage.number)/constants.OFFSET);

              for(const task of parsedMessage.taskList){
                if(!PublicMap.has(task)){
                  console.log("RecoveryPublicTasks: ",task)
                  client.subscribe(String(task), {qos:0, retain:true})
                }
              }
              localStorage.setItem('totalPublicPages',  String(totalPublicPage));
              localStorage.setItem('totalPublicItems',  String(parsedMessage.number));
              console.log("TOTALPUBLICPAGE: ", localStorage.getItem("totalPublicPages"))
              console.log("TOTALPUBLICITEMS: ", localStorage.getItem("totalPublicItems"))
              console.log("TERMINE RECOVERY PUB TASKS: ", PublicMap)
              client.unsubscribe("RecoveryPublicTasks")
            }
          }
          if(topic == "CompletePublicTasks"){
            if(parsedMessage.status == "allUpdatedPublicTasks"){
                console.log("Update Public Tasks")
                console.log(parsedMessage)
                let totalPublicPage= Math.ceil( parseInt(parsedMessage.number)/constants.OFFSET);
  
                for(const task of parsedMessage.taskList){
                  if(!PublicMap.has(task)){
                    console.log("RecoveryPublicTasks: ",task)
                    client.subscribe(String(task), {qos:0, retain:true})
                  }
                }
                localStorage.setItem('totalPublicPages',  String(totalPublicPage));
                localStorage.setItem('totalPublicItems',  String(parsedMessage.number));
                console.log("TOTALPUBLICPAGE: ", localStorage.getItem("totalPublicPages"))
                console.log("TOTALPUBLICITEMS: ", localStorage.getItem("totalPublicItems"))
                console.log("TERMINE RECOVERY PUB TASKS: ", PublicMap)
                client.unsubscribe("CompletePublicTasks")
              }
            }  
          
        }
          
      
     } catch (e) {
        console.log(e);
      }
    })

    client.on('close', function () {
      console.log(clientId + ' disconnected');
    })


    //WebSocket management
    ws.onopen = () => {
      ws.send('Message From Client');
      setOnlineList([]);
    }

    ws.onerror = (error) => {
      console.log(`WebSocket error: ${error}`);
    }

    ws.onclose = function (event) {
      console.log('The connection has been closed successfully.');
    };
    ws.onmessage = (e) => {
      try {
        messageReceived(e);
      } catch (error) {
        console.log(error);
      }

    }

    // check if user is authenticated
    const checkAuth = async () => {
      try {
        // here you have the user info, if already logged in
        const authenticated = await API.getUserInfo();
        if (authenticated) {
          //setUser();
          setLoggedIn(true);
        } else {
          console.log('error');
        }

      } catch (err) {
        console.log(err.error); // mostly unauthenticated user
      }
    };
    checkAuth();
  }, []);


  // set dirty to true only if acfiveFilter changes, if the active filter is not changed dirty = false avoids triggering a new fetch
  useEffect(() => {
    setDirty(true);
  }, [activeFilter])


  function addPublicTask(messageBroker) {
    PublicMap.set(parseInt(messageBroker.id), messageBroker)
    //client.subscribe(String(messageBroker.id), { qos: 0, retain:true })
    console.log("Parsed Message newPubTask/createdPubTask")
    console.log(messageBroker)
    
    let newArray = [...PublicMap.values()].sort((a,b)=>parseInt(a.id) < parseInt(b.id) ? -1:1)
    console.log(newArray)
    let totalPublicPages= Math.ceil(newArray.length / constants.OFFSET);
    let totalPublicItems = newArray.length;
    
    let oldTotalPublicPages = localStorage.getItem('totalPublicPages')
    
    localStorage.setItem('totalPublicItems',totalPublicItems.toString());
    
    let pageNumber = Number(localStorage.getItem('currentPage'))

    if(oldTotalPublicPages == totalPublicPages){
      setPubTasks(newArray.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
    }else{
      localStorage.setItem('totalPublicPages',totalPublicPages.toString());
      setPubTasks(newArray.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
    }

  }

  function removeOrDeletePublicTasks(topic) {
    console.log("Parsed Message remove/deletePubTask")
    client.unsubscribe(topic)
    if(PublicMap.has(parseInt(topic))){
      console.log("Sono qui: ", topic)
    PublicMap.delete(parseInt(topic))
    let temporalState =  ([...PublicMap.values()].filter((item) => item.id !== parseInt(topic))).sort((a,b)=>parseInt(a.id)<parseInt(b.id)?-1:1)
    let totalPublicPages= Math.ceil(temporalState.length / constants.OFFSET);
    let totalPublicItems = temporalState.length;
    localStorage.setItem('totalPublicPages',totalPublicPages.toString());
    localStorage.setItem('totalPublicItems',totalPublicItems.toString());
    
    if(totalPublicItems%constants.OFFSET){
      //let temporalState =  (oldstate.filter((item) => item.id !== parseInt(topic))).sort((a,b)=>parseInt(a.id)<parseInt(b.id)?-1:1) 
      //setPubTasks(oldstate => { return (oldstate.filter((item) => item.id !== parseInt(topic))).sort((a,b)=>parseInt(a.id)<parseInt(b.id)?-1:1) })
      let pageNumber = Number(localStorage.getItem('currentPage'))
      setPubTasks(temporalState.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
    }else{
        let num = Number(localStorage.getItem('currentPage'))
        if(num !== 1){
          num-=1
          localStorage.setItem('currentPage', String(num))
          setPubTasks(temporalState.filter((x,j)=> (j>=(num-1)*constants.OFFSET && j < (num)*constants.OFFSET)))
        }else{
          
          localStorage.setItem('currentPage', String(num))
          setPubTasks(temporalState.filter((x,j)=> (j>=(num-1)*constants.OFFSET && j < (num)*constants.OFFSET) ))
        }
    }
  }
  }

  function aggiornaTasks(topic, messageBroker) {
    console.log("UPDATE TASK")

    console.log("topic: ", topic)
    console.log(messageBroker)
    // funziona: PublicMap.set(parseInt(topic), messageBroker.task)
    
    if(!messageBroker.task.private){
      PublicMap.set(parseInt(topic), messageBroker.task)
      setPubTasks(oldstate => {
        return oldstate.map((item) => {

        if (item.id == parseInt(topic))
          return { ...messageBroker.task }
        else
          return item
      })
    })
  }else{
      setTaskList(oldstate => {

            return  oldstate.map((item) => {

                    if (item.id == parseInt(topic))
                       return messageBroker.task
                    else
                       return item
                   })
        
      })
    }
}

  const displayTaskSelection = (topic, parsedMessage) => {
    handler.emit(topic, parsedMessage);

    index = temp.findIndex(x => x.taskId == topic);
    let objectStatus = { taskId: topic, userName: parsedMessage.userName, status: parsedMessage.status };
    console.log("Topic: ", topic, " Index: ", index, " ParsedMessage: ", parsedMessage)
    if(index === -1){
      
      temp.push(objectStatus)

      setAssignedTaskList(temp)
      //.sort((a,b)=>{a.taskId.localCompare(b.taskId)   })
    }else{
        temp[index] = objectStatus
        setAssignedTaskList(temp)
    }
    setDirty(true);
  }

 const messageReceived = function(e) {
    let datas = JSON.parse(e.data.toString());
    console.log("DATAS: ",datas)
    if (datas.typeMessage == "login") {

      if(!TestLista.has(datas.userId)){
        TestLista.set(datas["userId"], datas)
        let test = [...TestLista.values()].sort((a, b) => {
          let fa = a.userName.toLowerCase();
          let fb = b.userName.toLowerCase();

          if (fa < fb) {
            return -1;
          }
          if (fa > fb) {
            return 1;
          }
          return 0;
        })
        /*console.log(test.sort((a, b) => {
          let fa = a.userName.toLowerCase();
          let fb = b.userName.toLowerCase();

          if (fa < fb) {
            return -1;
          }
          if (fa > fb) {
            return 1;
          }
          return 0;
        }))*/
        setOnlineList(test)
      
    }
    }

      {/*
        let flag = 0;
      for (let i = 0; i < TestLista.length; i++) {
        if (TestLista[i].userId == datas.userId) {
          flag = 1;
        }
      }
      if (flag == 0) {
        TestLista.push(datas);
        setOnlineList(TestLista);
      }
    */}
    
    if (datas.typeMessage == "logout") {

      
        if (TestLista.has(datas.userId)) {
          TestLista.delete(datas.userId);
        }
        
        let test = [...TestLista.values()];
     
        setOnlineList(test.sort((a, b) => {
                  let fa = a.userName.toLowerCase();
                  let fb = b.userName.toLowerCase();

                  if (fa < fb) {
                    return -1;
                  }
                  if (fa > fb) {
                    return 1;
                  }
                  return 0;
        }))
 
      
      }

      if (datas.typeMessage == "update") {

        
      TestLista.set(datas.userId, datas);
      let test = [...TestLista.values()]  

      setOnlineList(test.sort((a, b) => {
        let fa = a.userName.toLowerCase();
        let fb = b.userName.toLowerCase();

        if (fa < fb) {
          return -1;
        }
        if (fa > fb) {
          return 1;
        }
        return 0;
      }))
          
          
    
      }
      setDirty(true);
}


  const deleteTask = (task) => {
    API.deleteTask(task)
      .then(() =>{ 
      client.unsubscribe(String(task.id))
      setDirty(true)})
      .catch(e => handleErrors(e))
  }

  const completeTask = (task) => {
    API.completeTask(task)
      .then(() => { setDirty(true) })
      .catch(e => handleErrors(e))
  }


  const findTask = (id) => {
    return taskList.find(t => t.id === id);
  }

  const getInitialTasks = function(){
    if (loggedIn) {
      API.getTasks('owned')
        .then(tasks => {
          for (const element of tasks) {
            if (!OwnTasksMaps.has(element.id)) {
              client.subscribe(String(element.id), { qos: 0, retain: true });
              console.log("Subscribing to " + element.id)
              OwnTasksMaps.set(element.id, element)
             }
          }
          setTaskList(tasks);
        })
        .catch(e => handleErrors(e));
    }
  }

  const getPublicTasks = () => {
    /*API.getPublicTasks()
      .then(tasks => {
        for (const element of tasks) {
          if (!PublicMap.has(element.id)) {
            client.subscribe(String(element.id), { qos: 0, retain: true });
            console.log("Subscribing to public task: " + element.id)
            PublicMap.set(element.id, element)
          }
        }
        //console.log(tasks) sorting dopo .sort((a,b)=>{if(parseInt(a.id)<parseInt(b.id)) return -1; else return 1}));
        let array = PublicMap.values().map(x=>x)
        setPubTasks([...PublicMap.values()]
        //.sort((a,b)=>{if(a.id<b.id) return -1; else return 1})
                          
        //.sort((a,b)=>{a.taskId.localCompare(b.taskId)   })
      })
      .catch(e => handleErrors(e));
      */

      console.log(PublicMap)
      console.log(PublicMap.size)

      console.log("TOTAL PUBLIC TASKS RECEIVED: ", PublicMap.size)
      let newTempArray = [...PublicMap.values()].sort((a,b)=>a.id<b.id?-1:1)
      let totalPublicPages= Math.ceil(newTempArray.length / constants.OFFSET);
      localStorage.setItem("totalPublicPages",String(totalPublicPages));
      localStorage.setItem("totalPublicItems", String(newTempArray.length))
      console.log("ARRAY GETPUBPAGE: ", newTempArray)
      console.log("ARRAY FILTRATO: ", newTempArray.filter((_,temindex)=>(temindex>=0&&temindex<constants.OFFSET )))
      setPubTasks(newTempArray.filter((_,temindex)=>(temindex>=0&&temindex<constants.OFFSET )))

      
      /*else{
        console.log("ARRAY")
        console.log(        [...array.filter((x,j)=> {if(j < constants.OFFSET) return x}) ].sort((a,b)=> a.id < b.id ? -1: 1)       )
        setPubTasks([...array.filter((x,j)=> {if(j < constants.OFFSET) return x}) ].sort((a,b)=> a.id < b.id ? -1: 1))
      }
      */
      
  }

  const getPublicTasks2 = () => {
    API.getPublicTasks()
      .then(tasks => {
        for (const element of tasks) {
          if (!PublicMap.has(element.id)) {
            client.subscribe(String(element.id), { qos: 0, retain: true });
            console.log("Subscribing to public task: " + element.id)
            PublicMap.set(element.id, element)
          }
        }
        console.log("FORMATO DEI TASK DA VISUALIZZARE")
        console.log(tasks)
        console.log("FORMATO DEI TASK CHE HO IN PUBTASKMAP")
        console.log(PublicMap)
        setPubTasks([...tasks].sort((a,b)=>{if(parseInt(a.id)<parseInt(b.id)) return -1; else return 1}));
        //.sort((a,b)=>{if(a.id<b.id) return -1; else return 1})
                          
        //.sort((a,b)=>{a.taskId.localCompare(b.taskId)   })
      })
      .catch(e => handleErrors(e));
      
      //setPubTasks([...PublicMap.values()].sort((a,b)=>{if(parseInt(a.id)<parseInt(b.id)) return -1; else return 1}));
  }

  const getAllOwnedTasks = () => {
    API.getAllOwnedTasks()
      .then(tasks => {
        setOwnedTaskList(tasks);
      })
      .catch(e => handleErrors(e));
  }

  const getUsers = () => {
    API.getUsers()
      .then(users => {
        setUserList(users);
      })
      .catch(e => handleErrors(e));
  }

  const refreshTasks = (filter, page) => {
    
    API.getTasks(filter, page)
      .then(tasks => {
        for (const element of tasks) {
          if (!OwnTasksMaps.has(element.id)) {
            client.subscribe(String(element.id), { qos: 0, retain: true });
            console.log("Subscribing to " + element.id)
            OwnTasksMaps.set(element.id, element)
           }
        }
        setTaskList(tasks);
        setDirty(false);
      })
      .catch(e => handleErrors(e));
    
  }

  const refreshPublic = (page) => {
    /*
    API.getPublicTasks(page)
      .then(tasks => {
        for (const element of tasks) {
          if (!PublicMap.has(element.id)) {
            client.subscribe(String(element.id), { qos: 0 });
            console.log("Subscribing to public task: " + element.id)
            PublicMap.set(element.id, element)
          }
        }
        console.log("Refreshing public tasks",tasks)
        setPubTasks(tasks.sort((a,b)=>{a.taskId.localCompare(b.taskId)   }));
        setDirty(false);
      })
      .catch(e => handleErrors(e));
      */

      let newTempArray = [...PublicMap.values()].sort((a,b)=>a.id<b.id?-1:1)
      var totalPage= Math.ceil(PublicMap.size / constants.OFFSET);
      var totalItems = PublicMap.size;
      localStorage.setItem('totalPublicPages',  totalPage.toString());
      localStorage.setItem('totalPublicItems',  totalItems.toString());
      if(page >= 1 && page <= Number(localStorage.getItem('totalPublicPages'))){
        
        localStorage.setItem('currentPage',page.toString());
        let pageNumber = parseInt(page)
        console.log("ARRAY")
        console.log(newTempArray.filter((_,tempIndex)=> (tempIndex >= ((pageNumber-1)*constants.OFFSET) && tempIndex < ((pageNumber)*constants.OFFSET)) ) )
        setPubTasks(newTempArray.filter((_,tempIndex)=> (tempIndex >= ((pageNumber-1)*constants.OFFSET) && tempIndex < ((pageNumber)*constants.OFFSET)) ))
      }
  }

  const assignTask = (userId, tasksId) => {
    for (const taskId of tasksId) {
      API.assignTask(Number(userId), taskId).catch(e => handleErrors(e));
    }
  }

  const removeAssignTask = (userId, tasksId) => {
    for (const taskId of tasksId) {
      API.removeAssignTask(Number(userId), taskId).catch(e => handleErrors(e));
    }
  }

  const selectTask = (task) => {
    API.selectTask(task)
      .then(() => setDirty(true))
      .catch(e => { alert('Task is already active for another user!'); handleErrors(e); })
  }


  useEffect(() => {
    if (loggedIn && dirty) {
      API.getTasks(activeFilter, localStorage.getItem('currentPage'))
        .then(tasks => {
          for (const element of tasks) {
            if (!OwnTasksMaps.has(element.id)) {
              client.subscribe(String(element.id), { qos: 0, retain: true });
              console.log("Subscribing to " + element.id)
              OwnTasksMaps.set(element.id, element)
             }
          }
          setTaskList(tasks);
          setDirty(false);
        })
        .catch(e => handleErrors(e));
    }
  }, [activeFilter, dirty, loggedIn, user])

  // show error message in toast
  const handleErrors = (err) => {
    setMessage({ msg: err.error, type: 'danger' });
    console.log(err);
  }


  // add or update a task into the list
  const handleSaveOrUpdate = (task) => {

    // if the task has an id it is an update
    if (task.id) {
      API.updateTask(task)
        .then(response => {
          if (response.ok) {
            API.getTasks(activeFilter, localStorage.getItem('currentPage'))
              .then(tasks => {
                setTaskList(tasks);
              }).catch(e => handleErrors(e));
          }
        }).catch(e => handleErrors(e));

      // otherwise it is a new task to add
    } else {
      API.addTask(task)
        .then(() => {
          client.subscribe(String(task.id), {qos:0})
          setDirty(true)})
        .catch(e => handleErrors(e));
    }
    setSelectedTask(MODAL.CLOSED);
  }

  const handleEdit = (task) => {
    setSelectedTask(task.id);
  }

  const handleClose = () => {
    setSelectedTask(MODAL.CLOSED);
  }

  const doLogIn = async (credentials) => {
    try {
      const LoggedUser = await API.logIn(credentials);
      setUser(LoggedUser);
      setLoggedIn(true);
      console.log("PublicTasks Topic. RecoveryPublicTasks Topic.")
      client.subscribe("PublicTasks", { qos: 0, retain: false })
      client.subscribe("RecoveryPublicTasks", {qos:0, retain: true})
      client.subscribe("CompletePublicTasks",{qos:0, retain:true})

      localStorage.setItem('totalPublicItems','test');
      localStorage.setItem('totalPublicPages', 'test');

    }
    catch (err) {
      // error is handled and visualized in the login form, do not manage error, throw it
      throw err;
    }
  }

  const handleLogOut = async () => {
    // clean up everything

    for(const [key, val] of PublicMap.entries()){
      client.unsubscribe(String(val.id))
      console.log("Unsubscribe of topic: ", val.id)
    }
    PublicMap.clear()
    OwnTasksMaps.clear()
    TestLista.clear()
    setLoggedIn(false);
    setUser(null);
    setTaskList([]);
    setDirty(true);
    setPubTasks([]);

   client.unsubscribe("PublicTasks")
    client.unsubscribe("RecoveryPublicTasks")
    await API.logOut()
    localStorage.removeItem('currentPage');
    localStorage.removeItem('totalItems');
    localStorage.removeItem('totalPublicItems');
    localStorage.removeItem('totalPublicPages');
    localStorage.removeItem('totalPages');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    localStorage.removeItem('username');

  }


  return (

    <Container fluid>
      <Row>
        <Navigation onLogOut={handleLogOut} loggedIn={loggedIn} user={user} getPublicTasks={getPublicTasks} getInitialTasks={getInitialTasks} />
      </Row>

      <Toast show={message != ''} onClose={() => setMessage('')} delay={5000} autohide>
        <Toast.Body>{message.msg}</Toast.Body>
      </Toast>

      <Switch>
        <Route path="/login">
          <Row className="vh-100 below-nav">
            {loggedIn ? <Redirect to="/" /> : <LoginForm login={doLogIn} />}
          </Row>
        </Route>


        <Route path="/public">
          <Row className="vheight-100">
            <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
              <span>&nbsp;&nbsp;</span>
              <MiniOnlineList onlineList={onlineList} />
            </Col>
            <Col className="col-8">
              <Row className="vh-100 below-nav">
                <PublicMgr publicList={pubTasks} refreshPublic={refreshPublic}></PublicMgr>
              </Row>
            </Col>
          </Row>
        </Route>

        <Route path="/online">
          <Row className="vheight-100">
            <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
              <span>&nbsp;&nbsp;</span>
              <MiniOnlineList onlineList={onlineList} />
            </Col>
            <Col sm={8} className="below-nav">
              <h5><strong>Online Users</strong></h5>
              <div className="user">
                <OnlineList usersList={onlineList} ws={ws} />
              </div>
            </Col>
          </Row>
        </Route>

        <Route path="/assignment">
          {loggedIn ?
            <Row className="vheight-100">
              <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
                <span>&nbsp;&nbsp;</span>
                <MiniOnlineList onlineList={onlineList} />
              </Col>
              <Col sm={8} bg="light" id="left-sidebar" className="collapse d-sm-block below-nav">
                <Assignments OwnedTaskList={OwnedTaskList} getAllOwnedTasks={getAllOwnedTasks} UserList={userList} getUsers={getUsers} assignTask={assignTask} removeAssignTask={removeAssignTask} />
              </Col>
            </Row>
            : <Redirect to="/login" />
          } </Route>

        <Route path={["/list/:filter"]}>
          {loggedIn ?
            <Row className="vh-100 below-nav">
              <TaskMgr taskList={taskList} filter={activeFilter} onDelete={deleteTask} onEdit={handleEdit} onComplete={completeTask} onCheck={selectTask} onSelect={handleSelectFilter} refreshTasks={refreshTasks} onlineList={onlineList} myhandler={handler} assignedTaskList={assignedTaskList}></TaskMgr>
              <Button variant="success" size="lg" className="fixed-right-bottom" onClick={() => setSelectedTask(MODAL.ADD)}>+</Button>
              {(selectedTask !== MODAL.CLOSED) && <ModalForm task={findTask(selectedTask)?findTask(selectedTask):null} onSave={handleSaveOrUpdate} onClose={handleClose}></ModalForm>}
            </Row> : <Redirect to="/login" />
          }
        </Route>
        <Route>
          <Redirect to="/list/owned" />
        </Route>
      </Switch>
    </Container>

  );

}


const TaskMgr = (props) => {

  const { taskList, filter, onDelete, onEdit, onComplete, onCheck, onSelect, refreshTasks, onlineList, myhandler, assignedTaskList } = props;


  // ** FILTER DEFINITIONS **
  const filters = {
    'owned': { label: 'Owned Tasks', id: 'owned' },
    'assigned': { label: 'Assigned Tasks', id: 'assigned' }
  };

  // if filter is not know apply "all"
  const activeFilter = (filter && filter in filters) ? filter : 'owned';

  return (
    <>
      <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
        <Filters items={filters} defaultActiveKey={activeFilter} onSelect={onSelect} />
        <MiniOnlineList onlineList={onlineList} />
      </Col>
      <Col className="col-8">
        <h1 className="pb-3">Filter: <small className="text-muted">{activeFilter}</small></h1>
        <ContentList
          tasks={taskList}
          onDelete={onDelete} onEdit={onEdit} onCheck={onCheck} onComplete={onComplete} filter={activeFilter} getTasks={refreshTasks}
          handler={myhandler} assignedTaskList={assignedTaskList}
        />
      </Col>
    </>
  )

}


const PublicMgr = (props) => {

  const { publicList, refreshPublic } = props;


  return (
    <>
      <Col className="col-8">
        <h1 className="pb-3">Public Tasks</h1>
        <PublicList
          tasks={publicList} getTasks={refreshPublic}
        />
      </Col>
    </>
  )

}


export default App;
