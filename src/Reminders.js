import React, { Component } from 'react';
import moment from 'moment';

import Toaster from './views/Toaster';
import Microphone from './views/Microphone';
import RemindersList from './views/reminders/RemindersList';

class Reminders extends Component {
  constructor(props) {
    super(props);

    this.state = {
      reminders: [],
    };

    this.speechController = props.route.speechController;
    this.server = props.route.server;
    this.analytics = props.route.analytics;

    this.refreshInterval = null;
    this.toaster = null;
    this.microphone = null;
    this.debugEvent = this.debugEvent.bind(this);
    this.onVoiceCommand = this.onVoiceCommand.bind(this);
    this.onParsingFailure = this.onParsingFailure.bind(this);
    this.onWebPushMessage = this.onWebPushMessage.bind(this);
    this.refreshReminders = this.refreshReminders.bind(this);
    this.addReminder = this.addReminder.bind(this);

    moment.locale(navigator.languages || navigator.language || 'en-US');
  }

  componentDidMount() {
    this.refreshReminders();

    // Refresh the page every 10 seconds if idle.
    this.refreshInterval = setInterval(() => {
      this.refreshReminders()
        .then(() => {
          console.log('Reminders loaded');
        });
    }, 10 * 1000);

    this.speechController.on('speechrecognitionstart', this.debugEvent);
    this.speechController.on('speechrecognitionstop', this.debugEvent);
    this.speechController.on('reminder', this.debugEvent);

    this.speechController.on('reminder', this.onVoiceCommand);
    this.speechController.on('parsing-failed', this.onParsingFailure);
    this.server.on('push-message', this.onWebPushMessage);
  }

  componentWillUnmount() {
    clearInterval(this.refreshInterval);

    this.speechController.off('speechrecognitionstart', this.debugEvent);
    this.speechController.off('speechrecognitionstop', this.debugEvent);
    this.speechController.off('reminder', this.debugEvent);

    this.speechController.off('reminder', this.onVoiceCommand);
    this.speechController.off('parsing-failed', this.onParsingFailure);
    this.server.off('push-message', this.onWebPushMessage);
  }

  debugEvent(evt) {
    if (evt.result !== undefined) {
      console.log(evt.type, evt.result);
      return;
    }

    console.log(evt.type);
  }

  refreshReminders() {
    // @todo Add a loader.
    return this.server.reminders.getAll()
      .then((reminders) => {
        this.setState({ reminders });
      });
  }

  addReminder(reminder) {
    const reminders = this.state.reminders;
    reminders.push(reminder);

    this.setState({ reminders });
  }

  onVoiceCommand({ result }) {
    this.microphone.stopListeningToSpeech();

    switch (result.intent) {
      case 'reminder':
        return this.onReminder(result);

      case 'query':
        return this.onQuery(result);

      default: {
        console.info('Only intent of type `reminder` are supported now.');
        const message = 'I can only understand new reminders. ' +
          'Try saying "Remind me to go the hairdresser tomorrow at 5pm".';
        this.toaster.info(message);
        this.speechController.speak(message)
          .then(() => {
            this.toaster.hide();
          });
        break;
      }
    }
  }

  onReminder({ recipients, action, due, confirmation }) {
    // @todo Nice to have: optimistic update.
    // https://github.com/fxbox/calendar/issues/32
    this.server.reminders
      .set({
        recipients,
        action,
        due,
      })
      .then((reminder) => {
        this.analytics.event('reminders', 'create');

        this.addReminder(reminder);

        this.toaster.success(confirmation);
        this.speechController.speak(confirmation)
          .then(() => {
            console.log('Utterance terminated.');
            this.toaster.hide();
          });
      })
      .catch((res) => {
        console.warn('Saving the reminder failed.', res);

        this.analytics.event('reminders', 'error', 'create-failed');

        const message = 'This reminder could not be saved. ' +
          'Please try again later.';
        this.toaster.warning(message);
        this.speechController.speak(message)
          .then(() => {
            this.toaster.hide();
          });
      });
  }

  onQuery({ recipients, due }) {
    if (recipients.length !== 1) {
      console.error('Query must have only 1 recipient.');
    }

    // Reminders last for 3 hours by convention.
    const reminder = this.state.reminders.find((reminder) => {
      return reminder.recipients.includes(recipients[0])
        && reminder.due <= due && due <= (reminder.due + 3 * 60 * 60 * 1000);
    });

    let message;

    if (!reminder) {
      message = 'I don\'t have any appointment at that time.';
    } else {
      message = `You're busy with ${reminder.action}.`;
    }

    this.toaster.warning(message);
    this.speechController.speak(message)
      .then(() => {
        console.log('Utterance terminated.');
        this.toaster.hide();
      });
  }

  onParsingFailure() {
    this.microphone.stopListeningToSpeech();

    this.analytics.event('reminders', 'parsing-failed');

    const message = 'I did not understand that. Can you repeat?';
    this.toaster.warning(message);
    this.speechController.speak(message)
      .then(() => {
        console.log('Utterance terminated.');
        this.toaster.hide();
      });
  }

  onWebPushMessage(message) {
    const id = message.fullMessage.id;

    // We don't want to delete them, merely remove it from our local state.
    // At reload, we shouldn't get it because their status changed server-side
    // too.
    const reminders = this.state.reminders
      .filter((reminder) => reminder.id !== id);
    this.setState({ reminders });
  }

  // @todo Add a different view when there's no reminders:
  // https://github.com/fxbox/calendar/issues/16
  render() {
    return (
      <section className="reminders">
        <Toaster ref={(t) => this.toaster = t}/>
        <div className="microphone">
          <Microphone ref={(t) => this.microphone = t}
                      speechController={this.speechController}
                      server={this.server}
                      analytics={this.analytics}/>
        </div>
        <RemindersList reminders={this.state.reminders}
                       server={this.server}
                       analytics={this.analytics}
                       refreshReminders={this.refreshReminders}/>
      </section>
    );
  }
}

export default Reminders;
