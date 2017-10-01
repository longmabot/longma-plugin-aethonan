var ejs = require('ejs')
  , _ = require('lodash')
  , Entities = require('html-entities').XmlEntities
  , Aethonan = require('slackihook')

module.exports = {
  init: function (config, job, context, cb) {
    // Are we missing a trigger type hint? Log it out now: 
    // console.log(job);
    
    cb(null, {
      listen: function (io, context) {
        var phase = null;
        function onDeployError(id, data) {
          aethonanPOST(io, job, {exitCode: 1}, context, config, 'deploy')
          cleanup();
        }
        function onPhaseDone(id, data) {
          phase = data.phase;
          if (phase === "test" || phase === "deploy") {
            aethonanPOST(io, job, data, context, config, phase)
            if (data.next === "deploy") {
              io.on('job.status.phase.errored', onDeployError);
            } else {
              cleanup();
            }
          }
        }
        function cleanup() {
          io.removeListener('job.status.phase.done', onPhaseDone);
          io.removeListener('job.status.phase.errored', onDeployError);
          io.removeListener('job.status.cancelled', cleanup);
        }
        io.on('job.status.cancelled', cleanup);
        io.on('job.status.phase.done', onPhaseDone);
      }
    })
  }
}

function removeAethonanEvilAttr(str){
    str = str.replace("&", "&amp;");
    str = str.replace("<", "&lt;");
    str = str.replace(">", "&gt;");
    return str;
}

function aethonanPOST(io, job, data, context, config, phase) {
  var result = (data.exitCode === 0 ? 'pass' : 'fail');
  if (job.trigger.message) {
      var temp = job.trigger.message.split(/\n/);
      job.trigger.message = removeAethonanEvilAttr(temp[0]);
      temp.splice(0, 1);
      var more = temp.join("\n");
      job.trigger.messagemore = removeAethonanEvilAttr(more);
  }
  try {
    var compile = function (tmpl) {
      return ejs.compile(tmpl)(_.extend(job, {
        _:_ // bring lodash into scope for convenience
      }))
    };
    entities = new Entities();
    var msg = entities.decode(compile(config[phase+'_'+result+'_message']));
    aethonan = new Aethonan(config.webhookURL);
    var sendObject = {
      channel: config.channel,
      username: compile(config.username),
      icon_url: config.icon_url,
      text: msg
    }
    if (job.trigger.messagemoremessagemore){
        sendObject.attachments = [
        {
          "fallback": job.trigger.messagemore,
          "text": job.trigger.messagemore,
          "color": "#634545"
        }
      ];
    }
    
    aethonan.send(sendObject, function(err) {
      // It's too late to add notes to the job; just log
      if (err) console.error(err.stack)
    })
    io.emit('job.status.command.comment', job._id, {
      comment: 'Aethonan payload sent',
      plugin: 'aethonan',
      time: new Date(),
    })
  } catch (e) {
    console.error(e.stack)
    io.emit('job.status.command.comment', job._id, {
      comment: e.stack,
      plugin: 'aethonan',
      time: new Date(),
    })
  }
}
