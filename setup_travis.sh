#!/bin/bash
# Install chromedriver
if [ -x /usr/local/bin/chromedriver ]; then
    echo "You already have ChromeDriver installed. Skipping this step."
else
read -p "Do you want to Download and install now?Y/N " -n 1 -r
echo    # (optional) move to a new line
if [[  $REPLY =~ ^[Yy]$ ]]
then
    machine=`uname -m`
    if [ $machine = "x86_64" ] ; then 
        bits="64"; 
    elif [ $machine = "i686" ] ; then 
        bits="32"; 
    fi;
    version="2.12"
    wget -O /tmp/chromedriver.zip "https://chromedriver.storage.googleapis.com/$version/chromedriver_linux$bits.zip"
    sudo unzip /tmp/chromedriver.zip chromedriver -d /usr/local/bin/
    sudo chmod a+x /usr/local/bin/chromedriver
elif [[  $REPLY =~ ^[Nn]$ ]] ; then  
    exit 1   
fi;
fi;