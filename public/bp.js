(function() {
  $(document).ready(function() {
    var meContainer, meLoader, prContainer, prLoader;
    prContainer = $('#pull_requests');
    prLoader = $('#pull_requests_loading');
    if (prContainer.length > 0) {
      prContainer.load(prContainer.attr('rel'), function() {
        prLoader.slideUp('fast');
        if (prContainer.children().length > 0) {
          prContainer.slideDown('fast');
          return prContainer.find('#see_all').click(function() {
            $(this).remove();
            return $('#log').slideDown();
          });
        }
      });
    }
    meContainer = $('#me');
    meLoader = $('#me_loading');
    if (meContainer.length > 0) {
      return meContainer.load(meContainer.attr('rel'), function() {
        meLoader.slideUp('fast');
        if (meContainer.children().length > 0) {
          return meContainer.slideDown('fast');
        }
      });
    }
  });
}).call(this);
