{
  'targets': [
    {
      'target_name': 'raw',
      'sources': [
        'src/raw.cc'
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      'conditions' : [
        [
          'OS=="win"',
          {
            'libraries' : ['ws2_32.lib']
          }
        ],
        [
          "OS==\"mac\"",
          {
            "xcode_settings": {
              "MACOSX_DEPLOYMENT_TARGET": "10.7",
              "OTHER_CFLAGS": [
                "-arch x86_64",
                "-arch arm64"
              ],
              "OTHER_LDFLAGS": [
                "-arch x86_64",
                "-arch arm64"
              ]
            }
          }
        ]
      ]
    }
  ]
}
