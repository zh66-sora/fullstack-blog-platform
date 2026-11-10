export default {
  methods: {
    openDialog(type) {
      this.$store.dispatch("modal/open", type);
    }
  }
}