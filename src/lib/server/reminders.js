const p = Object.freeze({
  api: Symbol('api'),
  settings: Symbol('settings'),
  userNamesToIdMap: Symbol('userNamesToIdMap'),
  userIdToNamesMap: Symbol('userNamesToIdMap'),
});

export default class Reminders {
  constructor(api, settings) {
    this[p.api] = api;
    this[p.settings] = settings;

    this[p.userNamesToIdMap] = {};
    this[p.userIdToNamesMap] = {};
    this.getAllUsersInGroup();

    Object.seal(this);
  }

  /**
   * Retrieves all the users in the group of the current user.
   * This is used to map user names to their respective ids.
   */
  getAllUsersInGroup() {
    return Promise.all([
      this[p.api].get('users/myself'),
      this[p.api].get('users/myself/relations'),
    ])
      .then(([thisUser, users]) => {
        users.push(thisUser);

        this[p.userNamesToIdMap] = {};
        this[p.userIdToNamesMap] = {};
        users.forEach((user) => {
          if (!user.forename) {
            return;
          }

          this[p.userNamesToIdMap][user.forename] = user.id;
          this[p.userIdToNamesMap][user.id] = user.forename;
        });
      });
  }

  mapUsersToId(users = []) {
    if (!users.length) {
      return [
        {
          userId: 'myself',
          forename: 'Me',
        }
      ];
    }

    return users.map((user) => {
      if (user === 'me') {
        return {
          userId: 'myself',
          forename: 'Me',
        };
      }

      if (!this[p.userNamesToIdMap][user]) {
        console.error('Unknown user', user);
      }

      return {
        userId: this[p.userNamesToIdMap][user],
        forename: user,
      };
    });
  }

  /**
   * Retrieves the list of the reminders.
   *
   * @return {Promise<Array>} A promise that resolves with an array of objects.
   */
  getAll() {
    return this[p.api].get('reminders')
      .then((reminders) => {
        reminders.forEach((reminder) => {
          reminder.recipients = this.mapUsersToId(reminder.recipients);
        });

        return reminders;
      });
  }

  /**
   * Gets a reminder given its id.
   *
   * @param {string} id The ID of the reminder to retrieve.
   * @return {Promise}
   */
  get(id) {
    return this[p.api].get(`reminders/${id}`)
      .then((reminder) => {
        reminder.recipients = this.mapUsersToId(reminder.recipients);
        return reminder;
      });
  }

  /**
   * Create a new reminder.
   *
   * @param {Object} body
   * @return {Promise}
   */
  set(body) {
    body.recipients = this.mapUsersToId(body.recipients);
    return this[p.api].post(`reminders`, body);
  }

  /**
   * Create a new reminder.
   *
   * @param {Object} body
   * @return {Promise}
   */
  update(body) {
    const id = body.id;

    if (isNaN(id) || typeof id !== 'number') {
      return Promise.reject(new Error('The reminder id is not a number.'));
    }

    //body.recipients = this.mapUsersToId(body.recipients);
    delete body.recipients;
    return this[p.api].put(`reminders/${id}`, body);
  }

  /**
   * Delete a reminder given its ID.
   *
   * @param {string} id The ID of the reminder to delete.
   * @return {Promise}
   */
  delete(id) {
    return this[p.api].delete(`reminders/${id}/recipients/myself`);
  }
}
