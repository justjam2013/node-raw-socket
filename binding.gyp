{
  "variables": {
    "openssl_fips": ""
  },
  "targets": [
    {
      "target_name": "raw_socket",
      "sources": [
        "src/raw.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
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
        ],
        [
          "OS==\"win\"",
          {
            "libraries": [
              "ws2_32.lib"
            ]
          }
        ]
      ]
    }
  ]
}
