// Two files so that serverMessages (which calls `msg` as it loads) never
// loads before the functions it calls exist: it imports ./translate, not this.
export * from './translate';
export { translateServerMessage } from './serverMessages';
